"""
Bridge zwischen JavaScript und Python
Verwaltet die Kommunikation über QWebChannel
"""

import json
import base64
import time
import requests
import webbrowser

# Stelle sicher, dass QObject und pyqtSlot verfügbar sind
try:
    from PyQt6.QtCore import QObject, pyqtSlot
except ImportError:
    try:
        from PyQt5.QtCore import QObject, pyqtSlot
    except ImportError:
        QObject = object
        def pyqtSlot(*args, **kwargs):
            def decorator(func):
                return func
            return decorator

# Config-Import
try:
    from ..config import get_config, update_config, is_backend_mode, get_backend_url, get_auth_token, get_refresh_token, DEFAULT_BACKEND_URL
except ImportError:
    from config import get_config, update_config, is_backend_mode, get_backend_url, get_auth_token, get_refresh_token, DEFAULT_BACKEND_URL

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.


class WebBridge(QObject):
    """Bridge zwischen JS und Python"""

    def __init__(self, widget):
        super().__init__()
        self.widget = widget
        self.current_request = None  # Speichere aktuelle Anfrage für Abbrechen
        self._card_details_cache = {}  # {card_id: (timestamp, result_json)}

    @pyqtSlot(str)
    def sendMessage(self, message):
        # Speichere Referenz für mögliches Abbrechen
        self.current_request = message
        self.widget.handle_message_from_ui(message)
    
    @pyqtSlot()
    def cancelRequest(self):
        """Bricht die aktuelle Anfrage ab"""
        logger.debug("cancelRequest: Anfrage abbrechen")
        if self.current_request:
            cancelled_msg = self.current_request
            self.current_request = None
            
            # Breche Thread im Widget ab, falls vorhanden
            if hasattr(self.widget, '_ai_thread') and self.widget._ai_thread:
                logger.debug("cancelRequest: Breche Thread im Widget ab...")
                if hasattr(self.widget._ai_thread, 'cancel'):
                    self.widget._ai_thread.cancel()
                self.widget._ai_thread.quit()
                self.widget._ai_thread.wait(1000)
                self.widget._ai_thread = None
            
            # Sende Abbruch-Nachricht an UI
            payload = {"type": "bot", "message": "Anfrage abgebrochen."}
            self.widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            logger.debug("cancelRequest: Anfrage '%s...' wurde abgebrochen", cancelled_msg[:50])

    @pyqtSlot(str)
    def setModel(self, model_name):
        self.widget.set_model_from_ui(model_name)

    @pyqtSlot()
    def openSettings(self):
        try:
            from aqt import mw
            if mw:
                mw.onPrefs()
        except Exception:
            pass

    @pyqtSlot()
    def closePanel(self):
        self.widget.close_panel()

    @pyqtSlot(str, str, str)
    def saveSettings(self, api_key, provider, model_name):
        """Speichert Einstellungen"""
        logger.debug("saveSettings aufgerufen: api_key Länge=%s, provider=%s, model_name=%s", len(api_key) if api_key else 0, provider, model_name)
        # Speichere nur API-Key und Provider, Modell wird im Chat ausgewählt
        success = update_config(api_key=api_key, model_provider=provider, model_name=model_name or "")
        if success:
            logger.info("saveSettings: Config erfolgreich gespeichert")
            # Lade Config neu aus Datei (force_reload) und sende aktualisierte Model-Liste
            self.widget.config = get_config(force_reload=True)
            # Verifiziere, dass API-Key wirklich gespeichert wurde
            saved_api_key = self.widget.config.get("api_key", "")
            if saved_api_key == api_key:
                logger.info("saveSettings: ✓ API-Key erfolgreich verifiziert (Länge: %s)", len(saved_api_key))
            else:
                logger.warning("saveSettings: ⚠ WARNUNG: API-Key stimmt nicht überein! Gespeichert: %s, Erwartet: %s", len(saved_api_key), len(api_key))
            # Warte kurz, damit Config gespeichert ist, dann lade Modelle
            from aqt.qt import QTimer
            QTimer.singleShot(100, self.widget.push_updated_models)
        else:
            logger.error("saveSettings: ✗ FEHLER beim Speichern der Config!")
    
    @pyqtSlot(result=str)
    def getCurrentConfig(self):
        """Gibt aktuelle Konfiguration als JSON zurück"""
        # Lade Config neu aus Datei (nicht aus Cache)
        config = get_config(force_reload=True)
        api_key = config.get("api_key", "")
        logger.debug("getCurrentConfig: API-Key vorhanden: %s (Länge: %s)", 'Ja' if api_key else 'Nein', len(api_key))
        return json.dumps({
            "api_key": api_key,
            "provider": "google",  # Immer Google
            "model": config.get("model_name", ""),
            "mascot_enabled": config.get("mascot_enabled", False),
        })
    
    @pyqtSlot(str, str, result=str)
    def fetchModels(self, provider, api_key):
        """Ruft verfügbare Modelle von der API ab"""
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        
        try:
            logger.debug("fetchModels aufgerufen: provider=%s, api_key_length=%s", provider, len(api_key) if api_key else 0)
            ai = get_ai_handler()
            models = ai.fetch_available_models(provider, api_key)
            logger.debug("Modelle erhalten: %s Modelle", len(models) if models else 0)
            if models:
                for m in models:
                    logger.debug("  - %s: %s", m.get('name', 'unknown'), m.get('label', 'no label'))
            
            # Gib immer ein JSON-Objekt zurück
            return json.dumps({
                "success": True,
                "models": models if models else [],
                "error": None
            })
        except Exception as e:
            error_msg = str(e)
            logger.exception("Fehler in fetchModels: %s", error_msg)
            # Gib Fehlerinformation zurück
            return json.dumps({
                "success": False,
                "models": [],
                "error": error_msg
            })
    
    @pyqtSlot(result=str)
    def getCurrentDeck(self):
        """Gibt das aktuell aktive Deck zurück (oder None wenn kein Deck aktiv)"""
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"deckId": None, "deckName": None, "isInDeck": False})
            
            # Prüfe ob Reviewer aktiv ist (dann ist man in einem Deck)
            is_in_reviewer = False
            deck_id = None
            deck_name = None
            
            # Prüfe State - wenn "review" oder "overview", dann ist definitiv ein Deck aktiv
            if hasattr(mw, 'state') and (mw.state == "review" or mw.state == "overview"):
                is_in_reviewer = True # Wir nennen es intern so, damit die UI umschaltet
                # Hole Deck-ID
                if hasattr(mw, 'reviewer') and mw.reviewer and mw.reviewer.card:
                    deck_id = mw.reviewer.card.did
                else:
                    # Im Overview oder Reviewer ohne Karte
                    deck_id = mw.col.decks.selected()
            
            # Wenn Deck-ID gefunden, hole Namen
            if deck_id:
                try:
                    deck_name = mw.col.decks.name(deck_id)
                    return json.dumps({
                        "deckId": deck_id,
                        "deckName": deck_name,
                        "isInDeck": is_in_reviewer
                    })
                except (KeyError, AttributeError, TypeError):
                    # Deck-ID existiert nicht mehr - ignoriere
                    pass
            
            # Prüfe State - wenn "deckBrowser", dann ist KEIN Deck aktiv (Stapelübersicht)
            if hasattr(mw, 'state') and mw.state == "deckBrowser":
                # In Stapelübersicht - kein aktives Deck
                return json.dumps({"deckId": None, "deckName": None, "isInDeck": False})
            
            # Fallback: Prüfe ob ein Deck ausgewählt ist (aber Reviewer nicht aktiv)
            selected_deck_id = mw.col.decks.selected()
            if selected_deck_id:
                try:
                    deck_name = mw.col.decks.name(selected_deck_id)
                    return json.dumps({
                        "deckId": selected_deck_id,
                        "deckName": deck_name,
                        "isInDeck": False  # Deck ausgewählt, aber Reviewer nicht aktiv
                    })
                except (KeyError, AttributeError, TypeError):
                    pass

            return json.dumps({"deckId": None, "deckName": None, "isInDeck": False})
        except Exception as e:
            logger.exception("Fehler in getCurrentDeck: %s", e)
            return json.dumps({"deckId": None, "deckName": None, "isInDeck": False, "error": str(e)})
    
    @pyqtSlot(result=str)
    def getAvailableDecks(self):
        """Gibt alle verfügbaren Decks zurück"""
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"decks": []})
            
            decks = []
            for deck_id, deck_name in mw.col.decks.allNames():
                decks.append({
                    "id": deck_id,
                    "name": deck_name
                })
            
            return json.dumps({"decks": decks})
        except Exception as e:
            logger.exception("Fehler in getAvailableDecks: %s", e)
            return json.dumps({"decks": [], "error": str(e)})
    
    @pyqtSlot(int)
    def openDeck(self, deck_id):
        """Öffnet ein Deck im Reviewer"""
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                logger.debug("openDeck: mw oder mw.col ist None")
                return
            
            # Wähle Deck aus
            mw.col.decks.select(deck_id)
            # Öffne Reviewer
            mw.moveToState("review")
            logger.info("openDeck: Deck %s geöffnet", deck_id)
        except Exception as e:
            logger.exception("Fehler in openDeck: %s", e)

    @pyqtSlot(str)
    def goToCard(self, card_id):
        """Öffnet den Browser und zeigt die Karte an"""
        try:
            # Validate card_id is a valid integer to prevent injection
            try:
                card_id_int = int(card_id)
            except (ValueError, TypeError):
                logger.warning("goToCard: Ungültige card_id: %s", card_id)
                return

            from aqt import mw, dialogs

            # Öffne Browser
            browser = dialogs.open("Browser", mw)
            if browser:
                # Suche nach der Karten-ID (use validated int)
                browser.form.searchEdit.lineEdit().setText(f"cid:{card_id_int}")
                browser.onSearchActivated()
                logger.info("goToCard: Browser geöffnet für CID %s", card_id_int)
        except Exception as e:
            logger.exception("Fehler in goToCard: %s", e)
    
    _CARD_CACHE_TTL = 10  # seconds
    _CARD_CACHE_MAX = 50

    @pyqtSlot(str, result=str)
    def getCardDetails(self, card_id):
        """
        Lädt die Details einer Karte (Vorderseite/Rückseite) für die Anzeige im Frontend-Modal.
        Ergebnisse werden 10 Sekunden gecacht (max 50 Einträge).

        Args:
            card_id: Die Karten-ID

        Returns:
            JSON mit front, back, deckName, etc.
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"error": "No collection"})

            card_id_int = int(card_id)

            # Cache lookup
            now = time.time()
            cached = self._card_details_cache.get(card_id_int)
            if cached:
                ts, result_json = cached
                if now - ts < self._CARD_CACHE_TTL:
                    return result_json

            try:
                card = mw.col.get_card(card_id_int)
            except Exception as e:
                # Fallback: Versuche als Note-ID
                try:
                    note = mw.col.get_note(card_id_int)
                    cards = note.cards()
                    if cards:
                        card = cards[0]  # Erste Card der Note
                    else:
                        return json.dumps({"error": "No cards for note"})
                except Exception as e2:
                    return json.dumps({"error": "Card or Note not found"})

            if not card:
                return json.dumps({"error": "Card not found"})

            # Render content using Anki's template engine
            front = card.q()
            back = card.a()

            # Get deck name
            deck_name = "Unbekannt"
            try:
                deck = mw.col.decks.get(card.odid or card.did)
                if deck:
                    deck_name = deck['name']
            except (KeyError, AttributeError, TypeError):
                pass

            # Get model name
            model_name = "Unbekannt"
            try:
                note = card.note()
                model = note.model()
                model_name = model['name']
            except (KeyError, AttributeError, TypeError):
                pass

            result = {
                "id": card_id_int,
                "front": front,
                "back": back,
                "deckName": deck_name,
                "modelName": model_name
            }
            result_json = json.dumps(result)

            # Evict oldest entries if cache is full
            if len(self._card_details_cache) >= self._CARD_CACHE_MAX:
                oldest_key = min(self._card_details_cache, key=lambda k: self._card_details_cache[k][0])
                del self._card_details_cache[oldest_key]

            self._card_details_cache[card_id_int] = (now, result_json)
            return result_json

        except Exception as e:
            logger.exception("Fehler in getCardDetails: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot(str)
    def previewCard(self, card_id):
        """Zeigt Karte im Previewer an (seamless, ohne Review zu verlassen)"""
        try:
            from aqt import mw
            from aqt.previewer import Previewer

            if mw is None or mw.col is None:
                logger.debug("previewCard: mw oder mw.col ist None")
                return

            try:
                card_id_int = int(card_id)
            except (ValueError, TypeError):
                logger.warning("previewCard: Ungültige card_id: %s", card_id)
                return
            card = mw.col.get_card(card_id_int)
            if not card:
                logger.debug("previewCard: Karte %s nicht gefunden", card_id)
                return
            
            # Erstelle CardProvider für Previewer
            class CardProvider:
                def __init__(self, card_id, col):
                    self._card_id = card_id
                    self._col = col
                    self._card = col.get_card(card_id)
                
                def card(self, idx=0):
                    return self._card
                
                def card_changed(self):
                    return False
            
            provider = CardProvider(card_id_int, mw.col)
            
            # Öffne Previewer als Dialog
            previewer = Previewer(mw, parent=mw, card=provider.card())
            previewer.show()
            logger.info("previewCard: Previewer geöffnet für CID %s", card_id)
            
        except Exception as e:
            logger.exception("Fehler in previewCard: %s", e)
    
    @pyqtSlot(str, result=str)
    def openPreview(self, card_id_str):
        """Open card in two-stage preview mode. Works from any Anki state."""
        try:
            card_id = int(card_id_str)
            from ..custom_reviewer import open_preview
            result = open_preview(card_id)
            return json.dumps(result)
        except Exception as e:
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot()
    def openDeckBrowser(self):
        """Öffnet die Stapelübersicht (Deck Browser) in Anki"""
        try:
            from aqt import mw
            if mw is None:
                logger.debug("openDeckBrowser: mw ist None")
                return

            # Navigiere zur Stapelübersicht
            mw.moveToState("deckBrowser")
            logger.info("openDeckBrowser: Stapelübersicht geöffnet")
        except Exception as e:
            logger.exception("Fehler in openDeckBrowser: %s", e)

    @pyqtSlot()
    def openStats(self):
        """Öffnet die Anki-Statistiken"""
        try:
            from aqt import mw
            if mw:
                mw.onStats()
        except Exception as e:
            logger.error("Fehler in openStats: %s", e)

    @pyqtSlot()
    def createNewDeck(self):
        """Öffnet den Dialog zum Erstellen eines neuen Stapels"""
        try:
            from aqt import mw
            if mw and mw.col:
                mw.onCreateDeck()
        except Exception as e:
            logger.error("Fehler in createNewDeck: %s", e)

    @pyqtSlot()
    def openImport(self):
        """Öffnet den Anki-Import-Dialog"""
        try:
            from aqt import mw
            if mw:
                mw.onImport()
        except Exception as e:
            logger.error("Fehler in openImport: %s", e)

    @pyqtSlot()
    def advanceCard(self):
        """Close side panel and advance to next card (Weiter).
        Sends 'ease3' (Good) to the reviewer via pycmd handler."""
        try:
            from aqt import mw
            # Close the side panel first
            self.closePanel()
            # Then trigger card advance on the reviewer
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('if(window.rateCard) rateCard(window.autoRateEase || 3);')
        except Exception as e:
            logger.error("Fehler in advanceCard: %s", e)
    
    def _get_deck_stats(self, deck_id):
        """
        Helper-Methode: Gibt Deck-Statistiken zurück (nur totalCards)
        Wird von Hooks verwendet für schnelle totalCards-Berechnung
        
        Args:
            deck_id: Die Deck-ID
            
        Returns:
            dict mit totalCards oder None bei Fehler
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return None
            
            # Hole Karten-IDs für dieses Deck (inkl. Sub-Decks)
            try:
                card_ids = mw.col.decks.cids(deck_id, children=True)
            except (TypeError, AttributeError):
                # Fallback: Versuche ohne children
                try:
                    card_ids = mw.col.decks.cids(deck_id, children=False)
                except (TypeError, AttributeError, KeyError):
                    return None
            
            total_cards = len(card_ids)
            return {"totalCards": total_cards}
        except Exception as e:
            logger.error("Fehler in _get_deck_stats: %s", e)
            return None
    
    @pyqtSlot(int, result=str)
    def getDeckStats(self, deck_id):
        """
        Gibt Deck-Statistiken nach Wiederholungsanzahl zurück
        
        Args:
            deck_id: Die Deck-ID
            
        Returns:
            JSON mit Statistiken: totalCards, cards1x, cards2x, cards3x, level1Percent, level2Percent, level3Percent
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"error": "No collection"})
            
            # Hole Deck
            try:
                deck = mw.col.decks.get(deck_id)
                if not deck:
                    return json.dumps({"error": "Deck not found"})
            except (KeyError, AttributeError, TypeError):
                return json.dumps({"error": "Deck not found"})
            
            # Hole Karten-IDs für dieses Deck (inkl. Sub-Decks)
            try:
                card_ids = mw.col.decks.cids(deck_id, children=True)
            except (TypeError, AttributeError):
                # Fallback: Versuche ohne children
                try:
                    card_ids = mw.col.decks.cids(deck_id, children=False)
                except (TypeError, AttributeError, KeyError):
                    return json.dumps({"error": "Could not get cards"})
            
            total_cards = len(card_ids)
            
            if total_cards == 0:
                return json.dumps({
                    "totalCards": 0,
                    "cards1x": 0,
                    "cards2x": 0,
                    "cards3x": 0,
                    "level1Percent": 0,
                    "level2Percent": 0,
                    "level3Percent": 0
                })
            
            cards_1x = 0  # Mindestens 1x wiederholt
            cards_2x = 0  # Mindestens 2x wiederholt
            cards_3x = 0  # Mindestens 3x wiederholt
            
            for card_id in card_ids:
                try:
                    card = mw.col.get_card(card_id)
                    if card:
                        reps = card.reps or 0
                        if reps >= 1:
                            cards_1x += 1
                        if reps >= 2:
                            cards_2x += 1
                        if reps >= 3:
                            cards_3x += 1
                except (KeyError, AttributeError, TypeError):
                    # Ignoriere einzelne Karten-Fehler
                    continue
            
            level1_percent = round((cards_1x / total_cards * 100), 1) if total_cards > 0 else 0
            level2_percent = round((cards_2x / total_cards * 100), 1) if total_cards > 0 else 0
            level3_percent = round((cards_3x / total_cards * 100), 1) if total_cards > 0 else 0
            
            return json.dumps({
                "totalCards": total_cards,
                "cards1x": cards_1x,
                "cards2x": cards_2x,
                "cards3x": cards_3x,
                "level1Percent": level1_percent,
                "level2Percent": level2_percent,
                "level3Percent": level3_percent
            })
        except Exception as e:
            logger.exception("Fehler in getDeckStats: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot()
    def showAnswer(self):
        """Zeigt die Antwort der aktuellen Karte in Anki an"""
        try:
            from aqt import mw
            # Sicherstellen, dass wir im Haupt-Thread sind (für GUI-Operationen wichtig)
            if mw and mw.reviewer:
                mw.reviewer._showAnswer()
                logger.debug("showAnswer: Antwort angezeigt (mw.reviewer._showAnswer() aufgerufen)")
        except Exception as e:
            logger.exception("Fehler in showAnswer: %s", e)

    @pyqtSlot()
    def hideAnswer(self):
        """
        Versteckt die Antwort und zeigt wieder nur die Frage.
        Verwendet die interne _showQuestion Methode des Reviewers.
        """
        try:
            from aqt import mw
            if mw and mw.reviewer:
                # Setze den State zurück auf "question" und zeige die Frage
                if hasattr(mw.reviewer, '_showQuestion'):
                    mw.reviewer._showQuestion()
                    logger.debug("hideAnswer: Frage wieder angezeigt (_showQuestion)")
                elif hasattr(mw.reviewer, 'showQuestion'):
                    mw.reviewer.showQuestion()
                    logger.debug("hideAnswer: Frage wieder angezeigt (showQuestion)")
                else:
                    # Fallback: Lade Karte neu
                    if hasattr(mw.reviewer, 'card') and mw.reviewer.card:
                        mw.reviewer.card.load()
                        # Rufe die Standard-Methode auf
                        mw.reviewer._initWeb()
                        mw.reviewer._showQuestion()
                        logger.debug("hideAnswer: Karte neu geladen und Frage angezeigt")
                    else:
                        logger.debug("hideAnswer: Keine Karte aktiv")
        except Exception as e:
            logger.exception("Fehler in hideAnswer: %s", e)
    
    @pyqtSlot(str, str, result=str)
    def generateSectionTitle(self, question, answer):
        """
        Generiert einen kurzen Titel für einen Chat-Abschnitt basierend auf der Lernkarte.
        Runs the API call in a background thread to avoid blocking the UI.
        Returns immediately with a pending status; the result is sent via ankiReceive.
        """
        import threading
        logger.debug("bridge.generateSectionTitle: START (async)")

        widget_ref = self._widget_ref() if hasattr(self, '_widget_ref') and self._widget_ref else None

        def _generate_in_thread():
            try:
                try:
                    from ..ai.handler import get_ai_handler
                except ImportError:
                    from ai.handler import get_ai_handler
                ai = get_ai_handler()
                title = ai.get_section_title(question, answer)
                if title == "Lernkarte":
                    logger.error("⚠️ bridge.generateSectionTitle: Titel ist Fallback 'Lernkarte'")
                else:
                    logger.info("✅ bridge.generateSectionTitle: Erfolgreich, Titel: '%s'", title)
                # Send result back to frontend via ankiReceive
                result_payload = json.dumps({
                    "type": "sectionTitleGenerated",
                    "data": {"title": title, "success": title != "Lernkarte"}
                })
                try:
                    from aqt import mw as _mw
                except ImportError:
                    _mw = None
                if _mw and _mw.taskman:
                    def _send():
                        try:
                            if widget_ref and widget_ref.web_view:
                                widget_ref.web_view.page().runJavaScript(
                                    "window.ankiReceive(%s);" % result_payload
                                )
                        except Exception as e:
                            logger.warning("generateSectionTitle: send result failed: %s", e)
                    _mw.taskman.run_on_main(_send)
            except Exception as e:
                logger.error("❌ bridge.generateSectionTitle: Exception: %s", e)

        threading.Thread(target=_generate_in_thread, daemon=True).start()
        # Return immediately — result will come via ankiReceive event
        return json.dumps({"success": True, "title": "", "pending": True})
    
    # ──────────────────────────────────────────────
    #  Per-Card Session Methods (SQLite)
    # ──────────────────────────────────────────────

    @pyqtSlot(str, result=str)
    def loadCardSession(self, card_id_str):
        """Load a card's session (session + sections + messages) from SQLite."""
        try:
            from ..storage.card_sessions import load_card_session
            card_id = int(card_id_str)
            data = load_card_session(card_id)
            logger.debug("loadCardSession: card %s — session=%s, %d sections, %d messages",
                  card_id, 'yes' if data['session'] else 'no', len(data['sections']), len(data['messages']))
            return json.dumps(data, ensure_ascii=False)
        except Exception as e:
            logger.exception("Fehler in loadCardSession: %s", e)
            return json.dumps({'session': None, 'sections': [], 'messages': []})

    @pyqtSlot(str, result=str)
    def saveCardSession(self, data_json):
        """Save/update a card's full session to SQLite."""
        try:
            from ..storage.card_sessions import save_card_session
            data = json.loads(data_json)
            card_id = data.get('cardId') or data.get('card_id')
            if not card_id:
                return json.dumps({'success': False, 'error': 'Missing cardId'})
            success = save_card_session(card_id, data)
            logger.debug("saveCardSession: card %s, success=%s", card_id, success)
            return json.dumps({'success': success, 'error': None})
        except Exception as e:
            logger.exception("Fehler in saveCardSession: %s", e)
            return json.dumps({'success': False, 'error': str(e)})

    @pyqtSlot(str, result=str)
    def saveCardMessage(self, data_json):
        """Append a single message to a card's session."""
        try:
            from ..storage.card_sessions import save_message
            data = json.loads(data_json)
            card_id = data.get('cardId') or data.get('card_id')
            message = data.get('message', data)
            if not card_id:
                return json.dumps({'success': False, 'error': 'Missing cardId'})
            success = save_message(card_id, message)
            return json.dumps({'success': success, 'error': None})
        except Exception as e:
            logger.error("Fehler in saveCardMessage: %s", e)
            return json.dumps({'success': False, 'error': str(e)})

    @pyqtSlot(str, result=str)
    def saveCardSection(self, data_json):
        """Create or update a review section for a card."""
        try:
            from ..storage.card_sessions import save_section
            data = json.loads(data_json)
            card_id = data.get('cardId') or data.get('card_id')
            section = data.get('section', data)
            if not card_id:
                return json.dumps({'success': False, 'error': 'Missing cardId'})
            success = save_section(card_id, section)
            return json.dumps({'success': success, 'error': None})
        except Exception as e:
            logger.error("Fehler in saveCardSection: %s", e)
            return json.dumps({'success': False, 'error': str(e)})

    @pyqtSlot(str, result=str)
    def loadDeckMessages(self, deck_id_str):
        """Load chronological messages for a deck (all cards + deck-level)."""
        try:
            from ..storage.card_sessions import load_deck_messages
        except ImportError:
            from storage.card_sessions import load_deck_messages
        try:
            deck_id = int(deck_id_str)
            messages = load_deck_messages(deck_id, limit=50)
            return json.dumps({"success": True, "messages": messages})
        except Exception as e:
            logger.error("loadDeckMessages error: %s", e)
            return json.dumps({"success": False, "messages": [], "error": str(e)})

    @pyqtSlot(str, result=str)
    def saveDeckMessage(self, data_json):
        """Save a deck-level message (no card association)."""
        try:
            from ..storage.card_sessions import save_deck_message
        except ImportError:
            from storage.card_sessions import save_deck_message
        try:
            data = json.loads(data_json)
            deck_id = data.get('deckId')
            if deck_id is None:
                return json.dumps({"success": False, "error": "Missing deckId"})
            try:
                deck_id = int(deck_id)
            except (ValueError, TypeError):
                return json.dumps({"success": False, "error": "Invalid deckId"})
            message = data.get('message')
            if not isinstance(message, dict):
                return json.dumps({"success": False, "error": "Missing or invalid message"})
            success = save_deck_message(deck_id, message)
            return json.dumps({"success": success})
        except Exception as e:
            logger.error("saveDeckMessage error: %s", e)
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot(result=str)
    def clearDeckMessages(self):
        """Clear all free-chat messages (card_id IS NULL)."""
        try:
            from ..storage.card_sessions import clear_deck_messages
        except ImportError:
            from storage.card_sessions import clear_deck_messages
        try:
            count = clear_deck_messages()
            return json.dumps({"success": True, "count": count})
        except Exception as e:
            logger.exception("clearDeckMessages error")
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot(str, str, result=str)
    def searchImage(self, query, image_type="general"):
        """Delegiert an image_search Modul."""
        try:
            from ..utils.image_search import search_image
        except ImportError:
            from utils.image_search import search_image
        return search_image(query, image_type)

    @pyqtSlot(str, result=str)
    def fetchImage(self, url):
        """Delegiert an image_search Modul."""
        try:
            from ..utils.image_search import fetch_image
        except ImportError:
            from utils.image_search import fetch_image
        return fetch_image(url)

    @pyqtSlot(result=str)
    def getAITools(self):
        """Gibt aktuelle AI-Tool-Einstellungen als JSON zurück"""
        try:
            config = get_config(force_reload=True)
            ai_tools = config.get("ai_tools", {
                "images": True,
                "diagrams": True,
                "molecules": False
            })
            return json.dumps(ai_tools)
        except Exception as e:
            return json.dumps({"images": True, "diagrams": True, "molecules": False})

    @pyqtSlot(str)
    def saveAITools(self, tools_json):
        """Speichert AI-Tool-Einstellungen"""
        try:
            tools = json.loads(tools_json)
            success = update_config(ai_tools=tools)
            return json.dumps({"success": success, "error": None})
        except Exception as e:
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot(result=str)
    def getResponseStyle(self):
        """Gibt den aktuellen Antwortstil zurück"""
        try:
            config = get_config(force_reload=True)
            return config.get("response_style", "balanced")
        except (ValueError, KeyError, AttributeError):
            return "balanced"

    VALID_RESPONSE_STYLES = {"concise", "balanced", "detailed"}

    @pyqtSlot(str)
    def saveResponseStyle(self, style):
        """Speichert den Antwortstil"""
        try:
            if style not in self.VALID_RESPONSE_STYLES:
                logger.warning("saveResponseStyle: Ungültiger Stil: %s", style)
                return
            update_config(response_style=style)
        except Exception as e:
            logger.error("saveResponseStyle: Fehler: %s", e)

    @pyqtSlot(result=str)
    def getTheme(self):
        """Gibt das aktuelle Theme zurück"""
        try:
            config = get_config(force_reload=True)
            return config.get("theme", "dark")
        except (ValueError, KeyError, AttributeError):
            return "dark"

    VALID_THEMES = {"dark", "light", "system"}

    @pyqtSlot(str)
    def saveTheme(self, theme):
        """Speichert das Theme"""
        try:
            if theme not in self.VALID_THEMES:
                logger.warning("saveTheme: Ungültiges Theme: %s", theme)
                return
            update_config(theme=theme)
        except Exception as e:
            logger.error("saveTheme: Fehler: %s", e)

    @pyqtSlot()
    def openAnkiPreferences(self):
        """Öffnet die nativen Anki-Einstellungen"""
        try:
            from aqt import mw
            if hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception as e:
            logger.error("openAnkiPreferences: Fehler: %s", e)

    @pyqtSlot(str, str, result=str)
    def authenticate(self, token, refresh_token=""):
        """
        Authentifiziert User mit Firebase ID Token
        Speichert Token in Config und validiert durch Backend-Call
        Akzeptiert auch JSON-Format: {"token": "...", "refreshToken": "..."}
        """
        try:
            if not token or not token.strip():
                return json.dumps({"success": False, "error": "Kein Token angegeben"})

            # Erkennung von JSON-Format (Landing Page kopiert beide Tokens als JSON)
            token_str = token.strip()
            if token_str.startswith('{'):
                try:
                    token_data = json.loads(token_str)
                    token = token_data.get('token', '') or token_data.get('idToken', '')
                    refresh_token = token_data.get('refreshToken', '') or refresh_token
                    logger.debug("authenticate: JSON-Format erkannt, Token + RefreshToken extrahiert")
                except json.JSONDecodeError:
                    pass  # Kein gültiges JSON, behandle als normalen Token

            if not token or not token.strip():
                return json.dumps({"success": False, "error": "Kein Token angegeben"})

            logger.debug("authenticate: Token erhalten (Länge: %s, RefreshToken: %s)", len(token), 'Ja' if refresh_token else 'Nein')
            
            # Speichere Token in Config (noch nicht validiert)
            update_config(
                auth_token=token.strip(),
                refresh_token=refresh_token.strip() if refresh_token else "",
                backend_url=DEFAULT_BACKEND_URL,
                backend_mode=True,
                auth_validated=False  # Wird auf True gesetzt, wenn Validierung erfolgreich
            )
            
            # Validiere Token durch Backend-Call (optional - kann auch später validiert werden)
            try:
                backend_url = get_backend_url()
                # Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
                # Token bereinigen: Entferne alle nicht-ASCII Zeichen (sollte nicht vorkommen bei Firebase Tokens)
                token_clean = token.strip()
                # Entferne alle Zeichen, die nicht in latin-1 encodiert werden können
                # Token ist bereits ein sauberer ASCII/Base64 JWT - keine Konvertierung nötig
                
                # Timeout erhöht auf 15 Sekunden (Cloud Functions können bei Cold Start länger brauchen)
                response = requests.get(
                    f"{backend_url}/user/quota",
                    headers={
                        "Authorization": f"Bearer {token_clean}",
                        "Content-Type": "application/json"
                    },
                    timeout=15
                )
                
                if response.status_code == 200:
                    logger.info("authenticate: Token erfolgreich validiert")
                    # Markiere Token als validiert
                    update_config(auth_validated=True)
                    # Benachrichtige Frontend
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                        logger.debug("authenticate: Frontend benachrichtigt")
                    return json.dumps({"success": True, "message": "Authentifizierung erfolgreich"})
                elif response.status_code == 401:
                    error_msg = "Ungültiger Token - bitte prüfe deinen Token"
                    logger.error("authenticate: %s (Status: %s)", error_msg, response.status_code)
                    # Markiere Token als nicht validiert
                    update_config(auth_validated=False)
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_error", "message": error_msg}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                        logger.debug("authenticate: Frontend benachrichtigt")
                    return json.dumps({"success": False, "error": error_msg})
                else:
                    # Token gespeichert, aber Validierung fehlgeschlagen (Netzwerkfehler etc.)
                    error_msg = f"Token gespeichert, aber Validierung fehlgeschlagen (Status: {response.status_code})"
                    logger.error("authenticate: %s", error_msg)
                    # Token trotzdem speichern - kann später validiert werden
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_error", "message": error_msg}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                    return json.dumps({"success": False, "error": error_msg})
            except requests.exceptions.Timeout as e:
                # Timeout - Cloud Function könnte Cold Start haben
                error_msg = "Backend antwortet nicht (Timeout). Bitte versuche es erneut - die erste Anfrage kann länger dauern."
                logger.error("authenticate: %s", error_msg)
                logger.info("Token wurde trotzdem gespeichert - kann später validiert werden")
                if self.widget and self.widget.web_view:
                    payload = {"type": "auth_error", "message": error_msg}
                    js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                    self.widget.web_view.page().runJavaScript(js_code)
                return json.dumps({"success": False, "error": error_msg})
            except requests.exceptions.RequestException as e:
                # Netzwerkfehler - Token trotzdem speichern
                error_msg = f"Netzwerkfehler bei Validierung: {str(e)}"
                logger.error("authenticate: %s", error_msg)
                logger.info("Token wurde trotzdem gespeichert")
                if self.widget and self.widget.web_view:
                    payload = {"type": "auth_error", "message": error_msg}
                    js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                    self.widget.web_view.page().runJavaScript(js_code)
                return json.dumps({"success": False, "error": error_msg})
        except Exception as e:
            error_msg = str(e)
            logger.exception("❌ authenticate: Fehler: %s", error_msg)
            return json.dumps({"success": False, "error": error_msg})
    
    @pyqtSlot(result=str)
    def getAuthStatus(self):
        """Gibt den aktuellen Auth-Status zurück"""
        try:
            config = get_config()
            auth_token = config.get('auth_token', '').strip()
            backend_url = config.get('backend_url', '').strip() or DEFAULT_BACKEND_URL
            backend_mode = is_backend_mode()
            auth_validated = config.get('auth_validated', False)  # Wurde Token validiert?
            
            # Nur als authentifiziert markieren, wenn Token vorhanden UND validiert
            status = {
                "authenticated": bool(auth_token) and auth_validated,
                "hasToken": bool(auth_token),
                "backendUrl": backend_url,
                "backendMode": backend_mode
            }
            
            return json.dumps(status)
        except Exception as e:
            logger.exception("Fehler in getAuthStatus: %s", e)
            return json.dumps({
                "authenticated": False,
                "hasToken": False,
                "backendUrl": DEFAULT_BACKEND_URL,
                "backendMode": False
            })
    
    @pyqtSlot(result=str)
    def getAuthToken(self):
        """Gibt den aktuellen Auth-Token zurück (für API-Calls)"""
        try:
            config = get_config()
            auth_token = config.get('auth_token', '').strip()
            return json.dumps({"token": auth_token if auth_token else ""})
        except Exception as e:
            logger.exception("Fehler in getAuthToken: %s", e)
            return json.dumps({"token": ""})
    
    @pyqtSlot(result=str)
    def refreshAuth(self):
        """Ruft Token-Refresh auf"""
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        
        try:
            ai = get_ai_handler()
            if ai._refresh_auth_token():
                return json.dumps({"success": True, "message": "Token erfolgreich erneuert"})
            else:
                return json.dumps({"success": False, "error": "Token-Refresh fehlgeschlagen"})
        except Exception as e:
            error_msg = str(e)
            logger.exception("Fehler in refreshAuth: %s", error_msg)
            return json.dumps({"success": False, "error": error_msg})
    
    @pyqtSlot(result=str)
    def logout(self):
        """Löscht Auth-Token und setzt Auth-Status zurück"""
        try:
            update_config(
                auth_token="",
                refresh_token="",
                auth_validated=False
            )
            logger.info("logout: Auth-Token gelöscht")
            # Benachrichtige Frontend
            if self.widget and self.widget.web_view:
                payload = {"type": "auth_logout", "message": "Abgemeldet"}
                js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                self.widget.web_view.page().runJavaScript(js_code)
            return json.dumps({"success": True})
        except Exception as e:
            logger.exception("Fehler in logout: %s", e)
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot(result=str)
    def startLinkAuth(self):
        """
        Startet den Link-Code Auth Flow:
        1. Generiert kryptographisch sicheren Code
        2. Öffnet Landing Page mit ?link=CODE
        3. Startet Polling auf Backend (alle 2s, max 5 Min)
        4. Authentifiziert automatisch wenn Tokens ankommen
        """
        import secrets
        import threading

        try:
            # Generiere 32-Zeichen Code (kryptographisch sicher)
            link_code = secrets.token_urlsafe(24)  # 32 chars base64url
            logger.debug("startLinkAuth: Code generiert (%s...)", link_code[:8])

            # Öffne Landing Page mit Link-Code
            login_url = f"https://anki-plus.vercel.app/login?link={link_code}"
            webbrowser.open(login_url)

            # Benachrichtige Frontend: Polling gestartet
            if self.widget and self.widget.web_view:
                payload = {"type": "auth_linking", "message": "Warte auf Anmeldung im Browser..."}
                js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                self.widget.web_view.page().runJavaScript(js_code)

            # Starte Polling in separatem Thread
            def poll_for_tokens():
                import time
                backend_url = get_backend_url()
                max_attempts = 150  # 5 Minuten bei 2s Intervall

                for attempt in range(max_attempts):
                    time.sleep(2)
                    try:
                        response = requests.get(
                            f"{backend_url}/auth/link/{link_code}",
                            headers={"Content-Type": "application/json"},
                            timeout=5
                        )

                        if response.status_code == 200:
                            data = response.json()
                            id_token = data.get("idToken", "")
                            refresh_token = data.get("refreshToken", "")

                            if id_token:
                                logger.info("startLinkAuth: Tokens empfangen! (Attempt %s)", attempt+1)
                                # Authentifiziere mit beiden Tokens
                                # Muss auf dem Main-Thread laufen (Qt)
                                from aqt import mw
                                mw.taskman.run_on_main(
                                    lambda t=id_token, r=refresh_token: self._complete_link_auth(t, r)
                                )
                                return
                        elif response.status_code == 410:
                            # Code abgelaufen
                            logger.debug("startLinkAuth: Link-Code abgelaufen")
                            from aqt import mw
                            mw.taskman.run_on_main(
                                lambda: self._notify_auth_event("auth_link_expired", "Link abgelaufen. Bitte erneut versuchen.")
                            )
                            return
                        # 404 = noch nicht bereit, weiter pollen
                    except Exception as e:
                        # Netzwerkfehler — weiter versuchen
                        if attempt % 10 == 0:
                            logger.error("startLinkAuth: Polling-Fehler (Attempt %s): %s", attempt+1, e)

                # Timeout nach 5 Minuten
                logger.debug("startLinkAuth: Timeout nach 5 Minuten")
                from aqt import mw
                mw.taskman.run_on_main(
                    lambda: self._notify_auth_event("auth_link_timeout", "Zeitüberschreitung. Bitte erneut versuchen.")
                )

            thread = threading.Thread(target=poll_for_tokens, daemon=True, name="LinkAuthPoll")
            thread.start()

            return json.dumps({"success": True, "linkCode": link_code})
        except Exception as e:
            logger.exception("Fehler in startLinkAuth: %s", e)
            return json.dumps({"success": False, "error": str(e)})

    def _complete_link_auth(self, id_token, refresh_token):
        """Wird auf dem Main-Thread aufgerufen wenn Link-Auth Tokens empfangen wurden"""
        try:
            # Speichere Tokens
            update_config(
                auth_token=id_token.strip(),
                refresh_token=refresh_token.strip() if refresh_token else "",
                backend_url=DEFAULT_BACKEND_URL,
                backend_mode=True,
                auth_validated=False
            )

            # Validiere durch Backend-Call
            backend_url = get_backend_url()
            response = requests.get(
                f"{backend_url}/user/quota",
                headers={
                    "Authorization": f"Bearer {id_token.strip()}",
                    "Content-Type": "application/json"
                },
                timeout=15
            )

            if response.status_code == 200:
                update_config(auth_validated=True)
                logger.info("_complete_link_auth: Token validiert!")
                self._notify_auth_event("auth_success", "Erfolgreich verbunden!")
            else:
                # Token gespeichert, aber Validierung fehlgeschlagen
                logger.debug("_complete_link_auth: Validierung fehlgeschlagen (Status: %s)", response.status_code)
                self._notify_auth_event("auth_success", "Verbunden (Validierung ausstehend)")
        except Exception as e:
            logger.error("_complete_link_auth: Fehler: %s", e)
            # Token wurde trotzdem gespeichert
            self._notify_auth_event("auth_success", "Verbunden")

    def _notify_auth_event(self, event_type, message):
        """Sendet Auth-Event an Frontend"""
        if self.widget and self.widget.web_view:
            payload = {"type": event_type, "message": message}
            js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
            self.widget.web_view.page().runJavaScript(js_code)

    @pyqtSlot(str, result=str)
    def openUrl(self, url):
        """Öffnet eine URL im Standard-Browser"""
        try:
            webbrowser.open(url)
            return json.dumps({"success": True})
        except Exception as e:
            return json.dumps({"success": False, "error": str(e)})
    
    @pyqtSlot(str)
    def handleAuthDeepLink(self, url):
        """
        Verarbeitet Deep Link für Auth: anki://auth?token=...&refreshToken=...
        """
        try:
            logger.debug("handleAuthDeepLink: Verarbeite URL: %s...", url[:100])
            
            # Extrahiere Tokens aus URL
            from urllib.parse import urlparse, parse_qs
            
            parsed = urlparse(url)
            if parsed.scheme != "anki" or parsed.netloc != "auth":
                logger.debug("handleAuthDeepLink: Ungültiges URL-Format")
                return json.dumps({"success": False, "error": "Ungültiges URL-Format"})
            
            params = parse_qs(parsed.query)
            token = params.get("token", [None])[0]
            refresh_token = params.get("refreshToken", [None])[0]
            
            if not token:
                logger.debug("handleAuthDeepLink: Kein Token in URL gefunden")
                return json.dumps({"success": False, "error": "Kein Token in URL gefunden"})
            
            # Rufe authenticate auf
            result = self.authenticate(token, refresh_token or "")
            
            # Parse Ergebnis
            result_data = json.loads(result)
            if result_data.get("success"):
                logger.info("handleAuthDeepLink: ✓ Auth erfolgreich")
                # Sende Bestätigung an Frontend
                payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                self.widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            
            return result
        except Exception as e:
            error_msg = str(e)
            logger.exception("Fehler in handleAuthDeepLink: %s", error_msg)
            return json.dumps({"success": False, "error": error_msg})
    
    @pyqtSlot(int, str, result=str)
    def saveMultipleChoice(self, card_id, quiz_data_json):
        """
        Speichert Multiple-Choice-Daten in einem Custom Field der Anki-Note.
        
        Args:
            card_id: Die Karten-ID
            quiz_data_json: JSON-String mit Quiz-Daten im Format:
                {"question": "...", "options": [...], "createdAt": timestamp}
        
        Returns:
            JSON mit success-Status
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"success": False, "error": "No collection"})
            
            card_id_int = int(card_id)
            card = mw.col.get_card(card_id_int)
            if not card:
                return json.dumps({"success": False, "error": "Card not found"})
            
            note = card.note()
            model = note.model()
            
            # Prüfe ob Custom Field existiert, erstelle es falls nicht
            field_name = "_multipleChoice"
            if field_name not in model['flds']:
                # Erstelle neues Custom Field
                field = {
                    'name': field_name,
                    'ord': len(model['flds']),
                    'sticky': False,
                    'rtl': False,
                    'font': 'Arial',
                    'size': 20,
                    'media': []
                }
                model['flds'].append(field)
                mw.col.models.save(model)
                logger.info("saveMultipleChoice: Custom Field '%s' erstellt", field_name)
            
            # Validiere JSON-Format
            try:
                quiz_data = json.loads(quiz_data_json)
                if not isinstance(quiz_data, dict):
                    return json.dumps({"success": False, "error": "Invalid JSON format"})
                if 'question' not in quiz_data or 'options' not in quiz_data:
                    return json.dumps({"success": False, "error": "Missing required fields: question, options"})
            except json.JSONDecodeError as e:
                return json.dumps({"success": False, "error": f"Invalid JSON: {str(e)}"})
            
            # Füge Timestamp hinzu falls nicht vorhanden
            if 'createdAt' not in quiz_data:
                import time
                quiz_data['createdAt'] = int(time.time())
            
            # Speichere in Note Field
            note[field_name] = json.dumps(quiz_data)
            note.flush()
            
            logger.info("saveMultipleChoice: MC-Daten für Card %s gespeichert", card_id_int)
            return json.dumps({"success": True, "error": None})
            
        except Exception as e:
            error_msg = str(e)
            logger.exception("Fehler in saveMultipleChoice: %s", error_msg)
            return json.dumps({"success": False, "error": error_msg})
    
    @pyqtSlot(int, result=str)
    def loadMultipleChoice(self, card_id):
        """
        Lädt Multiple-Choice-Daten aus dem Custom Field der Anki-Note.
        
        Args:
            card_id: Die Karten-ID
        
        Returns:
            JSON mit quiz_data oder error
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"success": False, "quizData": None, "error": "No collection"})
            
            card_id_int = int(card_id)
            card = mw.col.get_card(card_id_int)
            if not card:
                return json.dumps({"success": False, "quizData": None, "error": "Card not found"})
            
            note = card.note()
            field_name = "_multipleChoice"
            
            # Prüfe ob Field existiert
            if field_name not in note.keys():
                return json.dumps({"success": False, "quizData": None, "error": "No multiple choice data"})
            
            field_value = note[field_name]
            if not field_value or not field_value.strip():
                return json.dumps({"success": False, "quizData": None, "error": "Field is empty"})
            
            # Parse JSON
            try:
                quiz_data = json.loads(field_value)
                return json.dumps({"success": True, "quizData": quiz_data, "error": None})
            except json.JSONDecodeError as e:
                return json.dumps({"success": False, "quizData": None, "error": f"Invalid JSON: {str(e)}"})
            
        except Exception as e:
            error_msg = str(e)
            logger.exception("Fehler in loadMultipleChoice: %s", error_msg)
            return json.dumps({"success": False, "quizData": None, "error": error_msg})
    
    @pyqtSlot(int, result=str)
    def hasMultipleChoice(self, card_id):
        """
        Prüft ob Multiple-Choice-Daten für eine Karte vorhanden sind.
        
        Args:
            card_id: Die Karten-ID
        
        Returns:
            JSON mit hasMC (boolean)
        """
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                return json.dumps({"hasMC": False})
            
            card_id_int = int(card_id)
            card = mw.col.get_card(card_id_int)
            if not card:
                return json.dumps({"hasMC": False})
            
            note = card.note()
            field_name = "_multipleChoice"
            
            has_mc = field_name in note.keys() and note[field_name] and note[field_name].strip()
            return json.dumps({"hasMC": bool(has_mc)})
            
        except Exception as e:
            # Bei Fehler: assume no MC
            return json.dumps({"hasMC": False})

    @pyqtSlot(result=str)
    def getEmbeddingStatus(self):
        """Return embedding indexing status as JSON."""
        try:
            try:
                from ..ai.embeddings import get_embedding_status
            except ImportError:
                from ai.embeddings import get_embedding_status
            return json.dumps(get_embedding_status())
        except Exception as e:
            logger.exception("getEmbeddingStatus error: %s", e)
            return json.dumps({"embeddedCards": 0, "totalCards": 0, "isRunning": False})

    @pyqtSlot(bool)
    def saveMascotEnabled(self, enabled):
        """Toggle Plusi mascot on/off."""
        try:
            try:
                from ..config import update_config
            except ImportError:
                from config import update_config
            update_config(mascot_enabled=enabled)
        except Exception as e:
            logger.exception("saveMascotEnabled error: %s", e)

    @pyqtSlot(str, str, str)
    def subagentDirect(self, agent_name, text, extra_json='{}'):
        """Route @Name messages to the appropriate subagent."""
        try:
            extra = json.loads(extra_json) if extra_json else {}
            self.widget._handle_subagent_direct(agent_name, text, extra)
        except Exception as e:
            logger.exception("subagentDirect error: %s", e)

    @pyqtSlot(result=str)
    def getSubagentRegistry(self):
        """Return enabled subagents as JSON for frontend registry."""
        try:
            try:
                from ..ai.agents import get_registry_for_frontend
            except ImportError:
                from ai.agents import get_registry_for_frontend
            config = self.widget.config
            return json.dumps(get_registry_for_frontend(config))
        except Exception as e:
            logger.exception("getSubagentRegistry error: %s", e)
            return '[]'

    @pyqtSlot(str, result=str)
    def saveSystemQuality(self, quality):
        """Save system quality mode (standard/deep)."""
        try:
            try:
                from ..config import get_config, save_config
            except ImportError:
                from config import get_config, save_config
            config = get_config()
            if quality in ('standard', 'deep'):
                config['system_quality'] = quality
                save_config(config)
                return json.dumps({"success": True})
            return json.dumps({"error": "Invalid quality value"})
        except Exception as e:
            logger.exception("saveSystemQuality error: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot(result=str)
    def getRemoteQR(self):
        """Generate pairing QR code and start relay client."""
        try:
            try:
                from ..plusi.remote_ws import get_client, start_remote
                from ..config import get_config
            except ImportError:
                from plusi.remote_ws import get_client, start_remote
                from config import get_config

            config = get_config()
            tg = config.get("telegram", {})
            relay_url = tg.get("relay_url", "").strip()
            remote_app_url = tg.get("remote_app_url", "").strip()

            if not relay_url:
                return json.dumps({"error": "relay_url not configured"})

            if not start_remote():
                return json.dumps({"error": "Could not connect to relay"})

            client = get_client()
            if not client or not client.pair_code:
                return json.dumps({"error": "No pair code generated"})

            pair_url = f"{remote_app_url}?pair={client.pair_code}"

            import io
            try:
                import qrcode
                qr = qrcode.QRCode(version=1, box_size=8, border=2)
                qr.add_data(pair_url)
                qr.make(fit=True)
                img = qr.make_image(fill_color="#FFFFFF", back_color="#141416")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                data_url = f"data:image/png;base64,{b64}"
            except ImportError:
                logger.warning("qrcode library not installed, returning URL only")
                data_url = ""

            return json.dumps({
                "qr_data_url": data_url,
                "pair_code": client.pair_code,
                "pair_url": pair_url,
            })

        except Exception as e:
            logger.exception("getRemoteQR error: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot(result=str)
    def getRemoteStatus(self):
        """Get current remote connection status."""
        try:
            try:
                from ..plusi.remote_ws import get_client
            except ImportError:
                from plusi.remote_ws import get_client

            client = get_client()
            if not client:
                return json.dumps({"connected": False, "peer_connected": False})

            return json.dumps({
                "connected": client.is_connected,
                "peer_connected": client.is_peer_connected,
                "pair_code": client.pair_code,
                "mode": client.mode,
            })
        except Exception as e:
            logger.exception("getRemoteStatus error: %s", e)
            return json.dumps({"connected": False, "peer_connected": False})

