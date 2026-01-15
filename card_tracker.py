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
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                return
            
            # Lade CSS-Datei
            addon_dir = os.path.dirname(os.path.abspath(__file__))
            css_path = os.path.join(addon_dir, 'card_styles.css')
            
            if not os.path.exists(css_path):
                print(f"card_tracker: CSS-Datei nicht gefunden: {css_path}")
                return
            
            with open(css_path, 'r', encoding='utf-8') as f:
                css_content = f.read()
            
            # Injiziere CSS in Reviewer
            css_js = f"""
            (function() {{
                if (document.getElementById('anki-card-modern-styles')) {{
                    return; // Bereits injiziert
                }}
                const style = document.createElement('style');
                style.id = 'anki-card-modern-styles';
                style.textContent = {json.dumps(css_content)};
                document.head.appendChild(style);
                
                // Wende modernes Design auf Card-Container an
                setTimeout(function() {{
                    const cardContainer = document.querySelector('.card') || document.querySelector('#qa');
                    if (cardContainer && !cardContainer.classList.contains('anki-card-modern')) {{
                        cardContainer.classList.add('anki-card-modern');
                    }}
                }}, 100);
            }})();
            """
            
            # Verwende reviewer.web.eval() für Injection
            if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                mw.reviewer.web.eval(css_js)
                if not self.css_injected:
                    self.css_injected = True
                    print("card_tracker: CSS injiziert")
            else:
                print("card_tracker: Reviewer web nicht verfügbar")
                    
        except Exception as e:
            import traceback
            print(f"Fehler beim Injizieren von Card-Styles: {e}")
            print(traceback.format_exc())
    
    def _inject_mc_script(self, card):
        """Injiziert JavaScript für MC-Integration"""
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                return
            
            # Prüfe ob bereits injiziert (nur einmal pro Session)
            if self.js_injected:
                # Re-initialisiere MC für neue Karte
                if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                    mw.reviewer.web.eval("""
                        if (window.ankiMCInitialized && typeof initMCIntegration === 'function') {
                            setTimeout(initMCIntegration, 300);
                        }
                    """)
                return
            
            # Lade JS-Datei
            addon_dir = os.path.dirname(os.path.abspath(__file__))
            js_path = os.path.join(addon_dir, 'card_mc_injector.js')
            
            if not os.path.exists(js_path):
                print(f"card_tracker: JS-Datei nicht gefunden: {js_path}")
                return
            
            with open(js_path, 'r', encoding='utf-8') as f:
                js_content = f.read()
            
            # Injiziere JS in Reviewer
            # Füge Card-ID zu Window-Objekt hinzu für JS-Zugriff
            js_with_card_id = f"""
            (function() {{
                // Setze Card-ID für JS-Zugriff
                window.anki = window.anki || {{}};
                window.anki.currentCardId = {card.id};
                
                {js_content}
            }})();
            """
            
            # Verwende reviewer.web.eval() für Injection
            if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                mw.reviewer.web.eval(js_with_card_id)
                self.js_injected = True
                print("card_tracker: MC-JS injiziert")
            else:
                # Fallback: Direkt über web_view
                if self.widget.web_view:
                    self.widget.web_view.page().runJavaScript(js_with_card_id)
                    self.js_injected = True
                    print("card_tracker: MC-JS injiziert (Fallback)")
                    
        except Exception as e:
            import traceback
            print(f"Fehler beim Injizieren von MC-Script: {e}")
            print(traceback.format_exc())

