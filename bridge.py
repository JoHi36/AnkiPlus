"""
Bridge zwischen JavaScript und Python
Verwaltet die Kommunikation über QWebChannel
"""

import json
import base64
import requests
import hashlib
from urllib.parse import unquote

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
    from .config import get_config, update_config, is_backend_mode, get_backend_url, get_auth_token, get_refresh_token, DEFAULT_BACKEND_URL
except ImportError:
    from config import get_config, update_config, is_backend_mode, get_backend_url, get_auth_token, get_refresh_token, DEFAULT_BACKEND_URL

# Sessions-Import
try:
    from .sessions_storage import load_sessions, save_sessions
except ImportError:
    from sessions_storage import load_sessions, save_sessions


class WebBridge(QObject):
    """Bridge zwischen JS und Python"""

    def __init__(self, widget):
        super().__init__()
        self.widget = widget
        self.current_request = None  # Speichere aktuelle Anfrage für Abbrechen

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
        })
    
    @pyqtSlot(str, str, result=str)
    def fetchModels(self, provider, api_key):
        """Ruft verfügbare Modelle von der API ab"""
        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler
        
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
    
    @pyqtSlot(str, result=str)
    def getCardDetails(self, card_id):
        """
        Lädt die Details einer Karte (Vorderseite/Rückseite) für die Anzeige im Frontend-Modal.
        
        Args:
            card_id: Die Karten-ID
            
        Returns:
            JSON mit front, back, deckName, etc.
        """
        # #region agent log
        import json as json_module
        import traceback
        try:
            debug_data = {"card_id_input": card_id, "card_id_type": type(card_id).__name__}
            with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                f.write(json_module.dumps({"location": "bridge.py:277", "message": "getCardDetails called", "data": debug_data, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
        except:
            pass
        # #endregion
        try:
            from aqt import mw
            if mw is None or mw.col is None:
                # #region agent log
                try:
                    with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                        f.write(json_module.dumps({"location": "bridge.py:290", "message": "getCardDetails: No collection", "data": {}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                return json.dumps({"error": "No collection"})
            
            card_id_int = int(card_id)
            # #region agent log
            try:
                with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                    f.write(json_module.dumps({"location": "bridge.py:292", "message": "getCardDetails: trying card_id_int", "data": {"card_id_int": card_id_int}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
            except:
                pass
            # #endregion
            try:
                card = mw.col.get_card(card_id_int)
                # #region agent log
                try:
                    with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                        f.write(json_module.dumps({"location": "bridge.py:294", "message": "getCardDetails: card found", "data": {"card_id": card.id if card else None}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
            except Exception as e:
                # #region agent log
                try:
                    with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                        f.write(json_module.dumps({"location": "bridge.py:296", "message": "getCardDetails: card not found, trying note_id", "data": {"error": str(e), "card_id_int": card_id_int}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                # Fallback: Versuche als Note-ID
                try:
                    note = mw.col.get_note(card_id_int)
                    cards = note.cards()
                    if cards:
                        card = cards[0]  # Erste Card der Note
                        # #region agent log
                        try:
                            with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                                f.write(json_module.dumps({"location": "bridge.py:301", "message": "getCardDetails: note found, using first card", "data": {"note_id": card_id_int, "card_id": card.id, "cards_count": len(cards)}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                        except:
                            pass
                        # #endregion
                    else:
                        # #region agent log
                        try:
                            with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                                f.write(json_module.dumps({"location": "bridge.py:303", "message": "getCardDetails: note found but no cards", "data": {"note_id": card_id_int}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                        except:
                            pass
                        # #endregion
                        return json.dumps({"error": "No cards for note"})
                except Exception as e2:
                    # #region agent log
                    try:
                        with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                            f.write(json_module.dumps({"location": "bridge.py:305", "message": "getCardDetails: note not found either", "data": {"error": str(e2), "card_id_int": card_id_int}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                    except:
                        pass
                    # #endregion
                    return json.dumps({"error": "Card or Note not found"})
            
            if not card:
                # #region agent log
                try:
                    with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                        f.write(json_module.dumps({"location": "bridge.py:307", "message": "getCardDetails: card is None", "data": {}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                return json.dumps({"error": "Card not found"})
            
            # Render content using Anki's template engine
            # card.q() returns the question, card.a() the answer
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
            # #region agent log
            try:
                with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                    f.write(json_module.dumps({"location": "bridge.py:333", "message": "getCardDetails: success", "data": {"card_id": card_id_int, "front_length": len(front) if front else 0, "back_length": len(back) if back else 0, "deck_name": deck_name}, "timestamp": int(__import__('time').time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
            except:
                pass
            # #endregion
            return json.dumps(result)
            
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
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler
        
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
    
    @pyqtSlot(result=str)
    def loadSessions(self):
        """
        Lädt alle Chat-Sessions aus der persistenten Speicherung
        
        Returns:
            JSON-Array mit allen Sessions
        """
        try:
            sessions = load_sessions()
            print(f"loadSessions: {len(sessions)} Sessions geladen")
            return json.dumps(sessions)
        except Exception as e:
            import traceback
            print(f"Fehler in loadSessions: {e}")
            print(traceback.format_exc())
            return json.dumps([])
    
    @pyqtSlot(str, result=str)
    def saveSessions(self, sessions_json):
        """
        Speichert Chat-Sessions persistent
        
        Args:
            sessions_json: JSON-String mit Sessions-Array
            
        Returns:
            JSON mit Erfolgs-Status
        """
        try:
            sessions = json.loads(sessions_json)
            success = save_sessions(sessions)
            print(f"saveSessions: {len(sessions)} Sessions, Erfolg: {success}")
            return json.dumps({
                "success": success,
                "error": None
            })
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler in saveSessions: {error_msg}")
            print(traceback.format_exc())
            return json.dumps({
                "success": False,
                "error": error_msg
            })
    
    @pyqtSlot(str, str, result=str)
    def searchImage(self, query, image_type="general"):
        """
        Sucht gezielt nach Bildern basierend auf Query und Typ.
        Unterstützt Wikimedia Commons, PubChem und Fallback zu Pexels.
        
        Args:
            query: Suchbegriff (z.B. "ATP molecule", "human heart anatomy", "mitochondria")
            image_type: "molecule", "anatomy", "general" (optional, Standard: "general")
            
        Returns:
            JSON mit imageUrl, source, description oder Fehler
        """
        try:
            print(f"searchImage: Suche nach '{query}' (Typ: {image_type})")
            
            # 1. PubChem für Moleküle
            if image_type == "molecule" or "molecule" in query.lower() or "molecular" in query.lower():
                pubchem_url = self._search_pubchem(query)
                if pubchem_url:
                    print(f"searchImage: ✓ PubChem Bild gefunden: {pubchem_url[:80]}...")
                    return json.dumps({
                        "success": True,
                        "imageUrl": pubchem_url,
                        "source": "pubchem",
                        "description": f"Molekülstruktur: {query}",
                        "error": None
                    })
            
            # 2. Wikimedia Commons für wissenschaftliche Bilder
            commons_url = self._search_wikimedia_commons(query)
            if commons_url:
                print(f"searchImage: ✓ Wikimedia Commons Bild gefunden: {commons_url[:80]}...")
                return json.dumps({
                    "success": True,
                    "imageUrl": commons_url,
                    "source": "wikimedia",
                    "description": f"Wissenschaftliches Bild: {query}",
                    "error": None
                })
            
            # 3. Fallback: Pexels (nur wenn nichts anderes gefunden)
            print(f"searchImage: ⚠ Keine wissenschaftliche Quelle gefunden, verwende Fallback")
            return json.dumps({
                "success": False,
                "imageUrl": None,
                "source": None,
                "description": None,
                "error": f"Kein passendes Bild für '{query}' gefunden. Verwende stattdessen direkte URLs zu Wikimedia Commons oder PubChem."
            })
            
        except Exception as e:
            import traceback
            error_msg = f"Fehler bei Bildsuche: {str(e)[:100]}"
            print(f"searchImage: ✗ Fehler: {e}")
            print(traceback.format_exc())
            return json.dumps({
                "success": False,
                "imageUrl": None,
                "source": None,
                "description": None,
                "error": error_msg
            })
    
    def _search_pubchem(self, query):
        """
        Sucht nach Molekülbildern in PubChem.
        Gibt direkte Bild-URL zurück oder None.
        """
        try:
            # PubChem REST API: Suche nach Compound
            search_url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{}/JSON"
            query_encoded = requests.utils.quote(query)
            
            response = requests.get(
                search_url.format(query_encoded),
                timeout=5,
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
            )
            
            if response.status_code == 200:
                data = response.json()
                # Extrahiere CID (Compound ID)
                if 'PC_Compounds' in data and len(data['PC_Compounds']) > 0:
                    cid = data['PC_Compounds'][0].get('id', {}).get('id', {}).get('cid', [None])[0]
                    if cid:
                        # Generiere Bild-URL
                        image_url = f"https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid={cid}&t=l"
                        return image_url
        except Exception as e:
            print(f"_search_pubchem: Fehler bei PubChem-Suche: {e}")
        
        return None
    
    def _search_wikimedia_commons(self, query):
        """
        Sucht nach Bildern in Wikimedia Commons.
        Gibt direkte Bild-URL zurück oder None.
        """
        try:
            # Wikimedia Commons API: Suche nach Dateien
            # API-Dokumentation: https://www.mediawiki.org/wiki/API:Search
            api_url = "https://commons.wikimedia.org/w/api.php"
            
            params = {
                'action': 'query',
                'format': 'json',
                'list': 'search',
                'srsearch': query,
                'srnamespace': 6,  # File namespace
                'srlimit': 5,
                'srprop': 'size|wordcount|timestamp',
                'origin': '*'
            }
            
            response = requests.get(
                api_url,
                params=params,
                timeout=5,
                headers={'User-Agent': 'Anki-Chatbot-Addon/1.0 (Educational Tool)'}
            )
            
            if response.status_code == 200:
                data = response.json()
                if 'query' in data and 'search' in data['query']:
                    results = data['query']['search']
                    if results:
                        # Nimm erstes Ergebnis und hole Bild-URL
                        filename = results[0]['title'].replace('File:', '')
                        # URL-encode den Dateinamen
                        filename_encoded = requests.utils.quote(filename.replace(' ', '_'))
                        
                        # Generiere direkte Bild-URL
                        # Format: https://upload.wikimedia.org/wikipedia/commons/[hash]/[filename]
                        # Für einfachere URLs nutzen wir die Thumbnail-API
                        image_url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{filename_encoded}?width=800"
                        return image_url
        except Exception as e:
            print(f"_search_wikimedia_commons: Fehler bei Wikimedia-Suche: {e}")
        
        return None
    
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
            print(f"getAITools: Tools geladen - Bilder: {ai_tools.get('images')}, Diagramme: {ai_tools.get('diagrams')}, Moleküle: {ai_tools.get('molecules')}")
            return json.dumps(ai_tools)
        except Exception as e:
            import traceback
            print(f"Fehler in getAITools: {e}")
            print(traceback.format_exc())
            # Fallback: Standardwerte
            default_tools = {
                "images": True,
                "diagrams": True,
                "molecules": False
            }
            return json.dumps(default_tools)
    
    @pyqtSlot(str)
    def saveAITools(self, tools_json):
        """Speichert AI-Tool-Einstellungen"""
        try:
            tools = json.loads(tools_json)
            print(f"saveAITools: Speichere Tools - Bilder: {tools.get('images')}, Diagramme: {tools.get('diagrams')}, Moleküle: {tools.get('molecules')}")
            success = update_config(ai_tools=tools)
            if success:
                print(f"saveAITools: ✓ Tools erfolgreich gespeichert")
            else:
                print(f"saveAITools: ✗ FEHLER beim Speichern der Tools!")
            return json.dumps({"success": success, "error": None})
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler in saveAITools: {error_msg}")
            print(traceback.format_exc())
            return json.dumps({"success": False, "error": error_msg})
    
    def _normalize_wikimedia_url(self, url):
        """
        Konvertiert Wikimedia Commons Special:FilePath URLs in direkte upload.wikimedia.org URLs.
        Die Pfadstruktur basiert auf dem MD5-Hash des Dateinamens.
        
        Format: https://upload.wikimedia.org/wikipedia/commons/[a]/[ab]/[Filename]
        wobei [a] = erstes Zeichen des MD5-Hash, [ab] = erste zwei Zeichen des MD5-Hash
        
        Args:
            url: Die zu normalisierende URL
            
        Returns:
            Normalisierte URL oder Original-URL falls keine Normalisierung nötig
        """
        # Prüfe ob es eine Wikimedia Commons Special:FilePath URL ist
        if 'commons.wikimedia.org' not in url or 'Special:FilePath' not in url:
            return url  # Keine Normalisierung nötig
        
        try:
            # Extrahiere Dateinamen aus URL
            filename_part = url.split('Special:FilePath/')[-1].split('?')[0]
            
            # Dekodiere URL-Encoding (%20 etc.)
            filename = unquote(filename_part)
            
            # Ersetze Leerzeichen durch Unterstriche (Wikimedia-Konvention)
            filename = filename.replace(' ', '_')
            
            # Berechne MD5-Hash des Dateinamens
            md5_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()
            
            # Extrahiere erste Zeichen für Pfadstruktur
            first_char = md5_hash[0]
            first_two_chars = md5_hash[:2]
            
            # Konstruiere direkte URL
            normalized_url = f"https://upload.wikimedia.org/wikipedia/commons/{first_char}/{first_two_chars}/{filename}"
            
            print(f"fetchImage: URL normalisiert: {url[:60]}... → {normalized_url[:60]}...")
            return normalized_url
            
        except Exception as e:
            print(f"fetchImage: Fehler bei URL-Normalisierung: {e}, verwende Original-URL")
            return url  # Fallback: Original-URL
    
    @pyqtSlot(str, result=str)
    def fetchImage(self, url):
        """
        Lädt ein Bild von einer externen URL und gibt es als Base64-Data-URL zurück.
        Dies umgeht die QWebEngine-Einschränkung für externe Ressourcen.
        
        Args:
            url: Die URL des Bildes
            
        Returns:
            JSON mit dataUrl (Base64) oder Fehler
        """
        try:
            # URL-Validierung - FRÜH ABFANGEN
            if not url or not isinstance(url, str) or len(url.strip()) == 0:
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": "Ungültige URL: Leere oder ungültige URL"
                })
            
            url = url.strip()
            
            # Prüfe auf gültige HTTP/HTTPS URL
            if not url.startswith(('http://', 'https://')):
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": "Ungültige URL: Nur HTTP/HTTPS URLs erlaubt"
                })
            
            # Prüfe auf verdächtige Zeichen (Security)
            if any(char in url for char in ['<', '>', '"', "'", '\n', '\r', '\t']):
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": "Ungültige URL: Enthält unerlaubte Zeichen"
                })
            
            # Validiere URL-Struktur
            try:
                from urllib.parse import urlparse
                parsed = urlparse(url)
                
                # Prüfe auf gültige Domain
                if not parsed.hostname or len(parsed.hostname) < 4:
                    return json.dumps({
                        "success": False,
                        "dataUrl": None,
                        "error": "Ungültige URL: Keine gültige Domain"
                    })
                
                # Prüfe auf lokale/private IPs (Security)
                if parsed.hostname in ['localhost', '127.0.0.1', '0.0.0.0']:
                    return json.dumps({
                        "success": False,
                        "dataUrl": None,
                        "error": "Ungültige URL: Lokale Adressen nicht erlaubt"
                    })
            except Exception as parse_error:
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": f"Ungültige URL: {str(parse_error)[:50]}"
                })
            
            # URL-Normalisierung für Wikimedia Commons
            original_url = url
            url = self._normalize_wikimedia_url(url)
            
            # Versuche normalisierte URL zu laden
            try:
                print(f"fetchImage: Lade Bild von {url[:100]}...")
                response = requests.get(url, timeout=10, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                })
                response.raise_for_status()
            except requests.exceptions.HTTPError as e:
                # Bei 404: Falls URL normalisiert wurde, versuche Original-URL
                if url != original_url and e.response.status_code == 404:
                    print(f"fetchImage: Normalisierte URL fehlgeschlagen (404), versuche Original-URL...")
                    try:
                        response = requests.get(original_url, timeout=10, headers={
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                        })
                        response.raise_for_status()
                        url = original_url  # Verwende Original-URL für weitere Verarbeitung
                    except:
                        # Beide URLs fehlgeschlagen
                        status_code = e.response.status_code if hasattr(e, 'response') else 'Unknown'
                        error_msg = f"Bild nicht verfügbar (HTTP {status_code})"
                        print(f"fetchImage: ✗ HTTP-Fehler {status_code}")
                        return json.dumps({
                            "success": False,
                            "dataUrl": None,
                            "error": error_msg
                        })
                else:
                    # Andere HTTP-Fehler oder URL nicht normalisiert
                    status_code = e.response.status_code if hasattr(e, 'response') else 'Unknown'
                    error_msg = f"Bild nicht verfügbar (HTTP {status_code})"
                    print(f"fetchImage: ✗ HTTP-Fehler {status_code}")
                    return json.dumps({
                        "success": False,
                        "dataUrl": None,
                        "error": error_msg
                    })
            except requests.exceptions.Timeout:
                error_msg = "Das Bild konnte nicht rechtzeitig geladen werden (Timeout)"
                print(f"fetchImage: ✗ Timeout")
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": error_msg
                })
            except requests.exceptions.RequestException as e:
                error_msg = "Bild konnte nicht geladen werden (Netzwerkfehler)"
                print(f"fetchImage: ✗ Netzwerkfehler: {e}")
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": error_msg
                })
            
            # Prüfe Content-Length (verhindert zu große Downloads)
            content_length = response.headers.get('content-length')
            if content_length:
                max_size = 10 * 1024 * 1024  # 10 MB Limit
                if int(content_length) > max_size:
                    return json.dumps({
                        "success": False,
                        "dataUrl": None,
                        "error": "Bild zu groß: Maximale Größe 10 MB"
                    })
            
            # Bestimme Content-Type
            content_type = response.headers.get('content-type', 'image/jpeg')
            # Bereinige Content-Type (entferne charset etc.)
            if ';' in content_type:
                content_type = content_type.split(';')[0].strip()
            
            # Prüfe tatsächliche Dateigröße (nach Download)
            if len(response.content) > 10 * 1024 * 1024:  # 10 MB Limit
                return json.dumps({
                    "success": False,
                    "dataUrl": None,
                    "error": "Bild zu groß: Maximale Größe 10 MB"
                })
            
            # Validiere Content-Type
            valid_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
            if not any(content_type.startswith(t) for t in valid_types):
                # Versuche aus URL zu erkennen
                if '.jpg' in url.lower() or '.jpeg' in url.lower():
                    content_type = 'image/jpeg'
                elif '.png' in url.lower():
                    content_type = 'image/png'
                elif '.gif' in url.lower():
                    content_type = 'image/gif'
                elif '.webp' in url.lower():
                    content_type = 'image/webp'
                elif '.svg' in url.lower():
                    content_type = 'image/svg+xml'
                else:
                    # Prüfe Magic Bytes (erste Bytes der Datei)
                    magic_bytes = response.content[:4]
                    if magic_bytes.startswith(b'\xff\xd8\xff'):
                        content_type = 'image/jpeg'
                    elif magic_bytes.startswith(b'\x89PNG'):
                        content_type = 'image/png'
                    elif magic_bytes.startswith(b'GIF8'):
                        content_type = 'image/gif'
                    elif magic_bytes.startswith(b'RIFF') and b'WEBP' in response.content[:12]:
                        content_type = 'image/webp'
                    else:
                        return json.dumps({
                            "success": False,
                            "dataUrl": None,
                            "error": "Ungültiger Dateityp: Kein unterstütztes Bildformat"
                        })
            
            # Konvertiere zu Base64
            base64_data = base64.b64encode(response.content).decode('utf-8')
            data_url = f"data:{content_type};base64,{base64_data}"
            
            print(f"fetchImage: ✓ Erfolgreich geladen ({len(response.content)} Bytes, {content_type})")
            
            return json.dumps({
                "success": True,
                "dataUrl": data_url,
                "error": None
            })
        except Exception as e:
            error_msg = f"Fehler beim Laden des Bildes: {str(e)[:100]}"
            import traceback
            print(f"fetchImage: ✗ Fehler beim Laden von {url}: {e}")
            print(traceback.format_exc())
            return json.dumps({
                "success": False,
                "dataUrl": None,
                "error": error_msg
            })
    
    @pyqtSlot(str, str, result=str)
    def authenticate(self, token, refresh_token=""):
        """
        Authentifiziert User mit Firebase ID Token
        Speichert Token in Config und validiert durch Backend-Call
        """
        try:
            if not token or not token.strip():
                return json.dumps({"success": False, "error": "Kein Token angegeben"})
            
            print(f"authenticate: Token erhalten (Länge: {len(token)})")
            
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
                token_clean = token_clean.encode('utf-8', errors='ignore').decode('latin-1', errors='ignore')
                
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
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler
        
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

