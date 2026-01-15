"""
Card-Tracking Modul
Verwaltet das Tracking von Anki-Karten und sendet Kontext an das Frontend
"""

import json
import os
from aqt import gui_hooks
from aqt.qt import QTimer


class CardTracker:
    """Verwaltet Card-Tracking für ein Widget"""
    
    def __init__(self, widget):
        # #region agent log
        import time
        log_path = "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log"
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location": "card_tracker.py:15", "message": "CardTracker.__init__ called", "data": {"has_widget": widget is not None, "widget_type": type(widget).__name__ if widget else None}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}) + "\n")
        except:
            pass
        # #endregion
        self.widget = widget
        self.card_tracking_timer = None
        self.current_card_context = None
        self.css_injected = False
        self.js_injected = False
        self.setup_card_tracking()
    
    def setup_card_tracking(self):
        """Richtet Karten-Tracking ein"""
        # Hook für Karten-Anzeige (nur card als Argument)
        def on_card_shown(card):
            """Wird aufgerufen, wenn eine Karte angezeigt wird"""
            # #region agent log
            import time
            log_path = "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log"
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({"location": "card_tracker.py:26", "message": "on_card_shown hook called", "data": {"has_card": card is not None, "card_id": card.id if card else None, "has_widget": self.widget is not None, "has_web_view": self.widget.web_view is not None if self.widget else False}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "B"}) + "\n")
            except:
                pass
            # #endregion
            if card and self.widget.web_view:
                self.send_card_context(card, is_question=True)
            # Injiziere CSS/JS in Reviewer
            if card:
                self._inject_card_styles(card)
                self._inject_mc_script(card)
        
        # Hook für Karten-Antwort (wenn Karte umgedreht wird)
        def on_answer_shown(card):
            """Wird aufgerufen, wenn die Antwort angezeigt wird"""
            if card and self.widget.web_view:
                self.send_card_context(card, is_question=False)
        
        # Hooks registrieren
        gui_hooks.reviewer_did_show_question.append(on_card_shown)
        gui_hooks.reviewer_did_show_answer.append(on_answer_shown)
        
        # Polling pausiert - verursachte Probleme beim manuellen Toggle
        # Der State wird jetzt über die Hooks und manuelles Polling bei Bedarf aktualisiert
        # self.card_tracking_timer = QTimer()
        # self.card_tracking_timer.timeout.connect(self._poll_current_card)
        # self.card_tracking_timer.start(1000)  # Alle 1 Sekunde
    
    def _poll_current_card(self):
        """Pollt die aktuelle Karte"""
        try:
            from aqt import mw
            if mw and hasattr(mw, 'reviewer') and mw.reviewer:
                if hasattr(mw.reviewer, 'card') and mw.reviewer.card:
                    # Prüfe ob Antwort bereits angezeigt wurde
                    is_question = not (hasattr(mw.reviewer, 'state') and mw.reviewer.state == "answer")
                    self.send_card_context(mw.reviewer.card, is_question=is_question)
        except Exception as e:
            # Ignoriere Fehler beim Polling
            pass
    
    def send_card_context(self, card, is_question=True):
        """Sendet Karten-Kontext an Frontend"""
        try:
            from aqt import mw
            if not card or not self.widget.web_view:
                return
            
            # Hole Karten-Informationen
            note = card.note()
            question = card.question()
            answer = card.answer()
            
            # Extrahiere relevante Felder
            fields = {}
            for field_name in note.keys():
                fields[field_name] = note[field_name]
            
            # Tags extrahieren
            tags = note.tags
            
            # Extrahiere Vorderseite direkt aus den Notizfeldern
            # Versuche verschiedene Feldnamen (Front, Vorderseite, Text, etc.)
            front_field = None
            field_names = list(note.keys())
            if field_names:
                # Priorität: Front > Vorderseite > erstes Feld
                for name in ['Front', 'Vorderseite', 'Text', 'Question', 'Frage']:
                    if name in fields and fields[name]:
                        front_field = fields[name]
                        break
                # Fallback: Erstes nicht-leeres Feld
                if not front_field:
                    for name in field_names:
                        if fields[name] and fields[name].strip():
                            front_field = fields[name]
                            break
            
            # Bereinige front_field von HTML-Tags für bessere Title-Generierung
            if front_field:
                import re
                # Entferne HTML-Tags
                clean_front = re.sub(r'<[^>]+>', ' ', front_field)
                # Entferne mehrfache Leerzeichen
                clean_front = re.sub(r'\s+', ' ', clean_front)
                # Entferne HTML-Entities
                clean_front = re.sub(r'&[a-zA-Z]+;', ' ', clean_front)
                front_field = clean_front.strip()
                print(f"card_tracker: frontField bereinigt: {front_field[:100] if front_field else 'leer'}...")
            
            # Hole Deck-Name
            deck_name = None
            if mw and mw.col:
                try:
                    deck_name = mw.col.decks.name(card.did)
                except:
                    pass
            
            # Hole Karten-Statistiken
            reps = getattr(card, 'reps', 0) or 0
            lapses = getattr(card, 'lapses', 0) or 0
            ivl = getattr(card, 'ivl', 0) or 0
            ease = getattr(card, 'factor', 2500) or 2500
            
            # Berechne Kenntnisscore (0-100)
            knowledge_score = 0
            if reps > 0:
                # Basis: Anzahl Wiederholungen (max 50 Punkte)
                rep_score = min(50, reps * 5)
                # Bonus: Langes Intervall = gut gelernt (max 30 Punkte)
                interval_score = min(30, ivl / 10) if ivl > 0 else 0
                # Penalty: Fehlerrate (max -20 Punkte)
                lapse_penalty = min(20, lapses * 5) if lapses > 0 else 0
                # Ease-Bonus (max 20 Punkte)
                ease_bonus = min(20, (ease - 2500) / 100) if ease > 2500 else 0
                
                knowledge_score = max(0, min(100, rep_score + interval_score - lapse_penalty + ease_bonus))
            else:
                knowledge_score = 0  # Neue Karte
            
            context = {
                "cardId": card.id,
                "noteId": card.nid,
                "question": question,
                "answer": answer,
                "fields": fields,
                "tags": tags,
                "frontField": front_field,  # Direktes Vorderseiten-Feld (ohne Templates)
                "deckId": card.did,
                "deckName": deck_name,
                "isQuestion": is_question,  # True = Frage, False = Antwort angezeigt
                "stats": {
                    "reps": reps,
                    "lapses": lapses,
                    "interval": ivl,
                    "ease": ease,
                    "knowledgeScore": round(knowledge_score, 1)
                }
            }
            
            # Speichere Kontext für AI-Anfragen (im Widget)
            self.widget.current_card_context = context
            
            payload = {
                "type": "cardContext",
                "data": context
            }
            
            js = f"window.ankiReceive({json.dumps(payload)});"
            self.widget.web_view.page().runJavaScript(js)
            
        except Exception as e:
            import traceback
            print(f"Fehler beim Senden des Karten-Kontexts: {e}")
            print(traceback.format_exc())
    
    def _inject_card_styles(self, card):
        """Injiziert CSS für modernes Card-Design"""
        # #region agent log
        import time
        log_path = "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log"
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps({"location": "card_tracker.py:179", "message": "_inject_card_styles called", "data": {"card_id": card.id if card else None, "has_mw": True}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
        except:
            pass
        # #endregion
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location": "card_tracker.py:183", "message": "_inject_card_styles: mw or reviewer missing", "data": {"has_mw": mw is not None, "has_reviewer": mw.reviewer is not None if mw else False}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                return
            
            # Lade Premium CSS-Datei
            addon_dir = os.path.dirname(os.path.abspath(__file__))
            css_path = os.path.join(addon_dir, 'reviewer_premium.css')
            
            if not os.path.exists(css_path):
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location": "card_tracker.py:191", "message": "_inject_card_styles: CSS file not found", "data": {"css_path": css_path}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                print(f"card_tracker: CSS-Datei nicht gefunden: {css_path}")
                return
            
            with open(css_path, 'r', encoding='utf-8') as f:
                css_content = f.read()
            
            # Injiziere Premium CSS in Reviewer
            css_js = f"""
            (function() {{
                if (document.getElementById('anki-premium-styles')) {{
                    return; // Bereits injiziert
                }}
                const style = document.createElement('style');
                style.id = 'anki-premium-styles';
                style.textContent = {json.dumps(css_content)};
                document.head.appendChild(style);
                console.log('ankiPremium: CSS injiziert');
            }})();
            """
            
            # Verwende reviewer.web.eval() für Injection
            has_web = hasattr(mw.reviewer, 'web') and mw.reviewer.web
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({"location": "card_tracker.py:219", "message": "_inject_card_styles: before eval", "data": {"has_web": has_web, "css_injected": self.css_injected}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
            except:
                pass
            # #endregion
            if has_web:
                mw.reviewer.web.eval(css_js)
                if not self.css_injected:
                    self.css_injected = True
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps({"location": "card_tracker.py:223", "message": "_inject_card_styles: CSS injected successfully", "data": {}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                    except:
                        pass
                    # #endregion
                    print("card_tracker: CSS injiziert")
            else:
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps({"location": "card_tracker.py:225", "message": "_inject_card_styles: reviewer.web not available", "data": {"has_reviewer_web_attr": hasattr(mw.reviewer, 'web'), "reviewer_web_value": mw.reviewer.web is not None if hasattr(mw.reviewer, 'web') else None}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
                except:
                    pass
                # #endregion
                print("card_tracker: Reviewer web nicht verfügbar")
                    
        except Exception as e:
            import traceback
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({"location": "card_tracker.py:227", "message": "_inject_card_styles: exception", "data": {"error": str(e)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}) + "\n")
            except:
                pass
            # #endregion
            print(f"Fehler beim Injizieren von Card-Styles: {e}")
            print(traceback.format_exc())
    
    def _inject_mc_script(self, card):
        """Injiziert JavaScript für MC-Integration"""
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                return
            
            # Lade Premium JS-Datei (nur einmal)
            if not self.js_injected:
                addon_dir = os.path.dirname(os.path.abspath(__file__))
                
                # 1. Lade HTML-Transformer JS (WICHTIG: Zuerst!)
                html_transformer_js_path = os.path.join(addon_dir, 'reviewer_html_transformer.js')
                if os.path.exists(html_transformer_js_path):
                    with open(html_transformer_js_path, 'r', encoding='utf-8') as f:
                        html_transformer_js_content = f.read()
                    
                    if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                        mw.reviewer.web.eval(html_transformer_js_content)
                        print("card_tracker: HTML-Transformer JS injiziert")
                
                # 2. Lade Premium JS (Interaktivität)
                premium_js_path = os.path.join(addon_dir, 'reviewer_premium.js')
                if os.path.exists(premium_js_path):
                    with open(premium_js_path, 'r', encoding='utf-8') as f:
                        premium_js_content = f.read()
                    
                    if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                        mw.reviewer.web.eval(premium_js_content)
                        print("card_tracker: Premium JS injiziert")
                
                # 3. Lade MC-Injector JS (für Multiple Choice)
                mc_js_path = os.path.join(addon_dir, 'card_mc_injector.js')
                if os.path.exists(mc_js_path):
                    with open(mc_js_path, 'r', encoding='utf-8') as f:
                        mc_js_content = f.read()
                    
                    if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                        mw.reviewer.web.eval(mc_js_content)
                        print("card_tracker: MC-JS injiziert")
                
                self.js_injected = True
            
            # Setze Card-ID für JS-Zugriff (bei jeder Karte)
            if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                set_card_id_js = f"""
                (function() {{
                    window.anki = window.anki || {{}};
                    window.anki.currentCardId = {card.id};
                    // Re-initialisiere MC für neue Karte
                    if (window.ankiMCInitialized && typeof initMCIntegration === 'function') {{
                        setTimeout(initMCIntegration, 500);
                    }}
                }})();
                """
                mw.reviewer.web.eval(set_card_id_js)
            else:
                print("card_tracker: Reviewer web nicht verfügbar")
                    
        except Exception as e:
            import traceback
            print(f"Fehler beim Injizieren von MC-Script: {e}")
            print(traceback.format_exc())

