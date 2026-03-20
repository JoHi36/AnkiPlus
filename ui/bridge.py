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
        print("cancelRequest: Anfrage abbrechen")
        if self.current_request:
            cancelled_msg = self.current_request
            self.current_request = None
            
            # Breche Thread im Widget ab, falls vorhanden
            if hasattr(self.widget, '_ai_thread') and self.widget._ai_thread:
                print(f"cancelRequest: Breche Thread im Widget ab...")
                if hasattr(self.widget._ai_thread, 'cancel'):
                    self.widget._ai_thread.cancel()
                self.widget._ai_thread.quit()
                self.widget._ai_thread.wait(1000)
                self.widget._ai_thread = None
            
            # Sende Abbruch-Nachricht an UI
            payload = {"type": "bot", "message": "Anfrage abgebrochen."}
            self.widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            print(f"cancelRequest: Anfrage '{cancelled_msg[:50]}...' wurde abgebrochen")

    @pyqtSlot(str)
    def setModel(self, model_name):
        self.widget.set_model_from_ui(model_name)

    @pyqtSlot()
    def openSettings(self):
        self.widget.open_settings_dialog()

    @pyqtSlot()
    def closePanel(self):
        self.widget.close_panel()

    @pyqtSlot(str, str, str)
    def saveSettings(self, api_key, provider, model_name):
        """Speichert Einstellungen"""
        print(f"saveSettings aufgerufen: api_key Länge={len(api_key) if api_key else 0}, provider={provider}, model_name={model_name}")
        # Speichere nur API-Key und Provider, Modell wird im Chat ausgewählt
        success = update_config(api_key=api_key, model_provider=provider, model_name=model_name or "")
        if success:
            print(f"saveSettings: Config erfolgreich gespeichert")
            # Lade Config neu aus Datei (force_reload) und sende aktualisierte Model-Liste
            self.widget.config = get_config(force_reload=True)
            # Verifiziere, dass API-Key wirklich gespeichert wurde
            saved_api_key = self.widget.config.get("api_key", "")
            if saved_api_key == api_key:
                print(f"saveSettings: ✓ API-Key erfolgreich verifiziert (Länge: {len(saved_api_key)})")
            else:
                print(f"saveSettings: ⚠ WARNUNG: API-Key stimmt nicht überein! Gespeichert: {len(saved_api_key)}, Erwartet: {len(api_key)}")
            # Warte kurz, damit Config gespeichert ist, dann lade Modelle
            from aqt.qt import QTimer
            QTimer.singleShot(100, self.widget.push_updated_models)
        else:
            print(f"saveSettings: ✗ FEHLER beim Speichern der Config!")
    
    @pyqtSlot(result=str)
    def getCurrentConfig(self):
        """Gibt aktuelle Konfiguration als JSON zurück"""
        # Lade Config neu aus Datei (nicht aus Cache)
        config = get_config(force_reload=True)
        api_key = config.get("api_key", "")
        print(f"getCurrentConfig: API-Key vorhanden: {'Ja' if api_key else 'Nein'} (Länge: {len(api_key)})")
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
            print(f"fetchModels aufgerufen: provider={provider}, api_key_length={len(api_key) if api_key else 0}")
            ai = get_ai_handler()
            models = ai.fetch_available_models(provider, api_key)
            print(f"Modelle erhalten: {len(models) if models else 0} Modelle")
            if models:
                for m in models:
                    print(f"  - {m.get('name', 'unknown')}: {m.get('label', 'no label')}")
            
            # Gib immer ein JSON-Objekt zurück
            return json.dumps({
                "success": True,
                "models": models if models else [],
                "error": None
            })
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler in fetchModels: {error_msg}")
            print(traceback.format_exc())
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
                except:
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
                except:
                    pass
            
            return json.dumps({"deckId": None, "deckName": None, "isInDeck": False})
        except Exception as e:
            import traceback
            print(f"Fehler in getCurrentDeck: {e}")
            print(traceback.format_exc())
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
            import traceback
            print(f"Fehler in getAvailableDecks: {e}")
            print(traceback.format_exc())
            return json.dumps({"decks": [], "error": str(e)})
    
    @pyqtSlot(int)
    def openDeck(self, deck_id):
        """Öffnet ein Deck im Reviewer"""
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                print(f"openDeck: mw oder mw.col ist None")
                return
            
            # Wähle Deck aus
            mw.col.decks.select(deck_id)
            # Öffne Reviewer
            mw.moveToState("review")
            print(f"openDeck: Deck {deck_id} geöffnet")
        except Exception as e:
            import traceback
            print(f"Fehler in openDeck: {e}")
            print(traceback.format_exc())

    @pyqtSlot(str)
    def goToCard(self, card_id):
        """Öffnet den Browser und zeigt die Karte an"""
        try:
            from aqt import mw, dialogs
            
            # Öffne Browser
            browser = dialogs.open("Browser", mw)
            if browser:
                # Suche nach der Karten-ID
                browser.form.searchEdit.lineEdit().setText(f"cid:{card_id}")
                browser.onSearchActivated()
                print(f"goToCard: Browser geöffnet für CID {card_id}")
        except Exception as e:
            import traceback
            print(f"Fehler in goToCard: {e}")
            print(traceback.format_exc())
    
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
            except:
                pass

            # Get model name
            model_name = "Unbekannt"
            try:
                note = card.note()
                model = note.model()
                model_name = model['name']
            except:
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
            import traceback
            print(f"Fehler in getCardDetails: {e}")
            print(traceback.format_exc())
            return json.dumps({"error": str(e)})

    @pyqtSlot(str)
    def previewCard(self, card_id):
        """Zeigt Karte im Previewer an (seamless, ohne Review zu verlassen)"""
        try:
            from aqt import mw
            from aqt.previewer import Previewer
            
            if mw is None or mw.col is None:
                print(f"previewCard: mw oder mw.col ist None")
                return
            
            card_id_int = int(card_id)
            card = mw.col.get_card(card_id_int)
            if not card:
                print(f"previewCard: Karte {card_id} nicht gefunden")
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
            print(f"previewCard: Previewer geöffnet für CID {card_id}")
            
        except Exception as e:
            import traceback
            print(f"Fehler in previewCard: {e}")
            print(traceback.format_exc())
    
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
                print(f"openDeckBrowser: mw ist None")
                return

            # Navigiere zur Stapelübersicht
            mw.moveToState("deckBrowser")
            print(f"openDeckBrowser: Stapelübersicht geöffnet")
        except Exception as e:
            import traceback
            print(f"Fehler in openDeckBrowser: {e}")
            print(traceback.format_exc())

    @pyqtSlot()
    def openStats(self):
        """Öffnet die Anki-Statistiken"""
        try:
            from aqt import mw
            if mw:
                mw.onStats()
        except Exception as e:
            print(f"Fehler in openStats: {e}")

    @pyqtSlot()
    def createNewDeck(self):
        """Öffnet den Dialog zum Erstellen eines neuen Stapels"""
        try:
            from aqt import mw
            if mw and mw.col:
                mw.onCreateDeck()
        except Exception as e:
            print(f"Fehler in createNewDeck: {e}")

    @pyqtSlot()
    def openImport(self):
        """Öffnet den Anki-Import-Dialog"""
        try:
            from aqt import mw
            if mw:
                mw.onImport()
        except Exception as e:
            print(f"Fehler in openImport: {e}")

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
            print(f"Fehler in advanceCard: {e}")
    
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
            except:
                # Fallback: Versuche ohne children
                try:
                    card_ids = mw.col.decks.cids(deck_id, children=False)
                except:
                    return None
            
            total_cards = len(card_ids)
            return {"totalCards": total_cards}
        except Exception as e:
            print(f"Fehler in _get_deck_stats: {e}")
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
            except:
                return json.dumps({"error": "Deck not found"})
            
            # Hole Karten-IDs für dieses Deck (inkl. Sub-Decks)
            try:
                card_ids = mw.col.decks.cids(deck_id, children=True)
            except:
                # Fallback: Versuche ohne children
                try:
                    card_ids = mw.col.decks.cids(deck_id, children=False)
                except:
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
                except:
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
            import traceback
            print(f"Fehler in getDeckStats: {e}")
            print(traceback.format_exc())
            return json.dumps({"error": str(e)})

    @pyqtSlot()
    def showAnswer(self):
        """Zeigt die Antwort der aktuellen Karte in Anki an"""
        try:
            from aqt import mw
            # Sicherstellen, dass wir im Haupt-Thread sind (für GUI-Operationen wichtig)
            if mw and mw.reviewer:
                mw.reviewer._showAnswer()
                print("showAnswer: Antwort angezeigt (mw.reviewer._showAnswer() aufgerufen)")
        except Exception as e:
            import traceback
            print(f"Fehler in showAnswer: {e}")
            print(traceback.format_exc())

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
                    print("hideAnswer: Frage wieder angezeigt (_showQuestion)")
                elif hasattr(mw.reviewer, 'showQuestion'):
                    mw.reviewer.showQuestion()
                    print("hideAnswer: Frage wieder angezeigt (showQuestion)")
                else:
                    # Fallback: Lade Karte neu
                    if hasattr(mw.reviewer, 'card') and mw.reviewer.card:
                        mw.reviewer.card.load()
                        # Rufe die Standard-Methode auf
                        mw.reviewer._initWeb()
                        mw.reviewer._showQuestion()
                        print("hideAnswer: Karte neu geladen und Frage angezeigt")
                    else:
                        print("hideAnswer: Keine Karte aktiv")
        except Exception as e:
            import traceback
            print(f"Fehler in hideAnswer: {e}")
            print(traceback.format_exc())
    
    @pyqtSlot(str, str, result=str)
    def generateSectionTitle(self, question, answer):
        """
        Generiert einen kurzen Titel für einen Chat-Abschnitt basierend auf der Lernkarte
        
        Args:
            question: Die Frage der Lernkarte
            answer: Die Antwort der Lernkarte (kann leer sein)
        
        Returns:
            JSON mit dem generierten Titel
        """
        print("=" * 60)
        print("bridge.generateSectionTitle: START")
        print("=" * 60)
        print(f"  Frage Länge: {len(question) if question else 0}")
        print(f"  Antwort Länge: {len(answer) if answer else 0}")
        print(f"  Frage (erste 100 Zeichen): {question[:100] if question else 'None'}...")
        
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        
        try:
            print(f"bridge.generateSectionTitle: Rufe get_ai_handler() auf...")
            ai = get_ai_handler()
            print(f"bridge.generateSectionTitle: AI Handler erhalten, rufe get_section_title() auf...")
            title = ai.get_section_title(question, answer)
            print(f"bridge.generateSectionTitle: get_section_title() zurückgegeben: '{title}'")
            
            # Prüfe ob "Lernkarte" ein Fallback ist (dann war etwas falsch)
            if title == "Lernkarte":
                print(f"⚠️ bridge.generateSectionTitle: Titel ist Fallback 'Lernkarte' - möglicherweise Fehler")
                return json.dumps({
                    "success": False,
                    "title": "Lernkarte",
                    "error": "Titel-Generierung fehlgeschlagen - siehe Debug-Logs für Details"
                })
            
            print(f"✅ bridge.generateSectionTitle: Erfolgreich, Titel: '{title}'")
            print("=" * 60)
            return json.dumps({
                "success": True,
                "title": title,
                "error": None
            })
        except Exception as e:
            import traceback
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"❌ bridge.generateSectionTitle: Exception aufgetreten")
            print(f"  Exception Type: {error_type}")
            print(f"  Error Message: {error_msg}")
            print(f"  Full Traceback:")
            print(traceback.format_exc())
            print("=" * 60)
            return json.dumps({
                "success": False,
                "title": "Lernkarte",
                "error": f"{error_type}: {error_msg}"
            })
    
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
            print(f"loadCardSession: card {card_id} — session={'yes' if data['session'] else 'no'}, "
                  f"{len(data['sections'])} sections, {len(data['messages'])} messages")
            return json.dumps(data, ensure_ascii=False)
        except Exception as e:
            import traceback
            print(f"Fehler in loadCardSession: {e}")
            traceback.print_exc()
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
            print(f"saveCardSession: card {card_id}, success={success}")
            return json.dumps({'success': success, 'error': None})
        except Exception as e:
            import traceback
            print(f"Fehler in saveCardSession: {e}")
            traceback.print_exc()
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
            print(f"Fehler in saveCardMessage: {e}")
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
            print(f"Fehler in saveCardSection: {e}")
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
            print(f"loadDeckMessages error: {e}")
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
            message = data.get('message', {})
            success = save_deck_message(deck_id, message)
            return json.dumps({"success": success})
        except Exception as e:
            print(f"saveDeckMessage error: {e}")
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
        except Exception:
            return "balanced"

    @pyqtSlot(str)
    def saveResponseStyle(self, style):
        """Speichert den Antwortstil"""
        try:
            update_config(response_style=style)
        except Exception as e:
            print(f"saveResponseStyle: Fehler: {e}")

    @pyqtSlot(result=str)
    def getTheme(self):
        """Gibt das aktuelle Theme zurück"""
        try:
            config = get_config(force_reload=True)
            return config.get("theme", "auto")
        except Exception:
            return "auto"

    @pyqtSlot(str)
    def saveTheme(self, theme):
        """Speichert das Theme"""
        try:
            update_config(theme=theme)
        except Exception as e:
            print(f"saveTheme: Fehler: {e}")

    @pyqtSlot()
    def openAnkiPreferences(self):
        """Öffnet die nativen Anki-Einstellungen"""
        try:
            from aqt import mw
            if hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception as e:
            print(f"openAnkiPreferences: Fehler: {e}")

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
                    print(f"authenticate: JSON-Format erkannt, Token + RefreshToken extrahiert")
                except json.JSONDecodeError:
                    pass  # Kein gültiges JSON, behandle als normalen Token

            if not token or not token.strip():
                return json.dumps({"success": False, "error": "Kein Token angegeben"})

            print(f"authenticate: Token erhalten (Länge: {len(token)}, RefreshToken: {'Ja' if refresh_token else 'Nein'})")
            
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
                    print("authenticate: Token erfolgreich validiert")
                    # Markiere Token als validiert
                    update_config(auth_validated=True)
                    # Benachrichtige Frontend
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                        print(f"authenticate: Frontend benachrichtigt")
                    return json.dumps({"success": True, "message": "Authentifizierung erfolgreich"})
                elif response.status_code == 401:
                    error_msg = "Ungültiger Token - bitte prüfe deinen Token"
                    print(f"authenticate: {error_msg} (Status: {response.status_code})")
                    # Markiere Token als nicht validiert
                    update_config(auth_validated=False)
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_error", "message": error_msg}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                        print(f"authenticate: Frontend benachrichtigt")
                    return json.dumps({"success": False, "error": error_msg})
                else:
                    # Token gespeichert, aber Validierung fehlgeschlagen (Netzwerkfehler etc.)
                    error_msg = f"Token gespeichert, aber Validierung fehlgeschlagen (Status: {response.status_code})"
                    print(f"authenticate: {error_msg}")
                    # Token trotzdem speichern - kann später validiert werden
                    if self.widget and self.widget.web_view:
                        payload = {"type": "auth_error", "message": error_msg}
                        js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                        self.widget.web_view.page().runJavaScript(js_code)
                    return json.dumps({"success": False, "error": error_msg})
            except requests.exceptions.Timeout as e:
                # Timeout - Cloud Function könnte Cold Start haben
                error_msg = "Backend antwortet nicht (Timeout). Bitte versuche es erneut - die erste Anfrage kann länger dauern."
                print(f"authenticate: {error_msg}")
                print("Token wurde trotzdem gespeichert - kann später validiert werden")
                if self.widget and self.widget.web_view:
                    payload = {"type": "auth_error", "message": error_msg}
                    js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                    self.widget.web_view.page().runJavaScript(js_code)
                return json.dumps({"success": False, "error": error_msg})
            except requests.exceptions.RequestException as e:
                # Netzwerkfehler - Token trotzdem speichern
                error_msg = f"Netzwerkfehler bei Validierung: {str(e)}"
                print(f"authenticate: {error_msg}")
                print("Token wurde trotzdem gespeichert")
                if self.widget and self.widget.web_view:
                    payload = {"type": "auth_error", "message": error_msg}
                    js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                    self.widget.web_view.page().runJavaScript(js_code)
                return json.dumps({"success": False, "error": error_msg})
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"❌ authenticate: Fehler: {error_msg}")
            print(traceback.format_exc())
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
            import traceback
            print(f"Fehler in getAuthStatus: {e}")
            print(traceback.format_exc())
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
            import traceback
            print(f"Fehler in getAuthToken: {e}")
            print(traceback.format_exc())
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
            import traceback
            error_msg = str(e)
            print(f"Fehler in refreshAuth: {error_msg}")
            print(traceback.format_exc())
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
            print("logout: Auth-Token gelöscht")
            # Benachrichtige Frontend
            if self.widget and self.widget.web_view:
                payload = {"type": "auth_logout", "message": "Abgemeldet"}
                js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                self.widget.web_view.page().runJavaScript(js_code)
            return json.dumps({"success": True})
        except Exception as e:
            import traceback
            print(f"Fehler in logout: {e}")
            print(traceback.format_exc())
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
            print(f"startLinkAuth: Code generiert ({link_code[:8]}...)")

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
                                print(f"startLinkAuth: Tokens empfangen! (Attempt {attempt+1})")
                                # Authentifiziere mit beiden Tokens
                                # Muss auf dem Main-Thread laufen (Qt)
                                from aqt import mw
                                mw.taskman.run_on_main(
                                    lambda t=id_token, r=refresh_token: self._complete_link_auth(t, r)
                                )
                                return
                        elif response.status_code == 410:
                            # Code abgelaufen
                            print("startLinkAuth: Link-Code abgelaufen")
                            from aqt import mw
                            mw.taskman.run_on_main(
                                lambda: self._notify_auth_event("auth_link_expired", "Link abgelaufen. Bitte erneut versuchen.")
                            )
                            return
                        # 404 = noch nicht bereit, weiter pollen
                    except Exception as e:
                        # Netzwerkfehler — weiter versuchen
                        if attempt % 10 == 0:
                            print(f"startLinkAuth: Polling-Fehler (Attempt {attempt+1}): {e}")

                # Timeout nach 5 Minuten
                print("startLinkAuth: Timeout nach 5 Minuten")
                from aqt import mw
                mw.taskman.run_on_main(
                    lambda: self._notify_auth_event("auth_link_timeout", "Zeitüberschreitung. Bitte erneut versuchen.")
                )

            thread = threading.Thread(target=poll_for_tokens, daemon=True, name="LinkAuthPoll")
            thread.start()

            return json.dumps({"success": True, "linkCode": link_code})
        except Exception as e:
            import traceback
            print(f"Fehler in startLinkAuth: {e}")
            print(traceback.format_exc())
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
                print("_complete_link_auth: Token validiert!")
                self._notify_auth_event("auth_success", "Erfolgreich verbunden!")
            else:
                # Token gespeichert, aber Validierung fehlgeschlagen
                print(f"_complete_link_auth: Validierung fehlgeschlagen (Status: {response.status_code})")
                self._notify_auth_event("auth_success", "Verbunden (Validierung ausstehend)")
        except Exception as e:
            print(f"_complete_link_auth: Fehler: {e}")
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
            print(f"handleAuthDeepLink: Verarbeite URL: {url[:100]}...")
            
            # Extrahiere Tokens aus URL
            from urllib.parse import urlparse, parse_qs
            
            parsed = urlparse(url)
            if parsed.scheme != "anki" or parsed.netloc != "auth":
                print(f"handleAuthDeepLink: Ungültiges URL-Format")
                return json.dumps({"success": False, "error": "Ungültiges URL-Format"})
            
            params = parse_qs(parsed.query)
            token = params.get("token", [None])[0]
            refresh_token = params.get("refreshToken", [None])[0]
            
            if not token:
                print(f"handleAuthDeepLink: Kein Token in URL gefunden")
                return json.dumps({"success": False, "error": "Kein Token in URL gefunden"})
            
            # Rufe authenticate auf
            result = self.authenticate(token, refresh_token or "")
            
            # Parse Ergebnis
            result_data = json.loads(result)
            if result_data.get("success"):
                print(f"handleAuthDeepLink: ✓ Auth erfolgreich")
                # Sende Bestätigung an Frontend
                payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                self.widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            
            return result
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler in handleAuthDeepLink: {error_msg}")
            print(traceback.format_exc())
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
                print(f"saveMultipleChoice: Custom Field '{field_name}' erstellt")
            
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
            
            print(f"saveMultipleChoice: MC-Daten für Card {card_id_int} gespeichert")
            return json.dumps({"success": True, "error": None})
            
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler in saveMultipleChoice: {error_msg}")
            print(traceback.format_exc())
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
            import traceback
            error_msg = str(e)
            print(f"Fehler in loadMultipleChoice: {error_msg}")
            print(traceback.format_exc())
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

