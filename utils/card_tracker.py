"""
Card-Tracking Modul
Verwaltet das Tracking von Anki-Karten und sendet Kontext an das Frontend
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from aqt import gui_hooks
from aqt.qt import QTimer

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

_embed_executor = ThreadPoolExecutor(max_workers=1)

_css_cache = None  # Cached CSS content


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
            import re
            def _clean_html(html):
                if not html:
                    return ''
                clean = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
                clean = re.sub(r'<script[^>]*>.*?</script>', '', clean, flags=re.DOTALL)
                clean = re.sub(r'<[^>]+>', ' ', clean)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = re.sub(r'\s+', ' ', clean)
                return clean.strip()

            if front_field:
                front_field = _clean_html(front_field)
                logger.debug("card_tracker: frontField bereinigt: %s...", front_field[:100] if front_field else 'leer')

            # Extract and clean back field (answer side)
            back_field = None
            for name in ['Back', 'Rückseite', 'Answer', 'Antwort', 'Extra']:
                if name in fields and fields[name]:
                    back_field = fields[name]
                    break
            if not back_field and field_names:
                # Fallback: second non-empty field (first is front)
                for name in field_names[1:]:
                    if fields.get(name, '').strip():
                        back_field = fields[name]
                        break
            if back_field:
                back_field = _clean_html(back_field)
            
            # Hole Deck-Name
            deck_name = None
            if mw and mw.col:
                try:
                    deck_name = mw.col.decks.name(card.did)
                except (KeyError, AttributeError):
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
                "backField": back_field,   # Direktes Rückseiten-Feld (ohne Templates)
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
            
            payload_json = json.dumps(payload)
            logger.debug("card_tracker: 🔴 SENDING cardContext to chat panel for cardId=%s", context.get('cardId'))
            # Use BOTH window.ankiReceive AND CustomEvent for reliability
            js = f"""(function() {{
                var payload = {payload_json};
                // Method 1: Direct ankiReceive call
                if (typeof window.ankiReceive === 'function') {{
                    window.ankiReceive(payload);
                }} else {{
                    console.error('🔴 card_tracker: window.ankiReceive is NOT a function!', typeof window.ankiReceive);
                }}
                // Method 2: CustomEvent fallback (more reliable)
                window.dispatchEvent(new CustomEvent('ankiCardContext', {{detail: payload}}));
                document.title = 'Card:' + payload.data.cardId;
            }})();"""
            self.widget.web_view.page().runJavaScript(js)

            # Lazy embed current card for semantic search (after UI update)
            try:
                try:
                    from .. import get_embedding_manager
                except ImportError:
                    from __init__ import get_embedding_manager
                emb_mgr = get_embedding_manager()
                if emb_mgr:
                    _embed_executor.submit(emb_mgr.ensure_embedded, card.id, context)
            except Exception as e:
                logger.debug("Embedding submission failed for card %s: %s", card.id, e)

        except Exception as e:
            logger.error("Fehler beim Senden des Karten-Kontexts: %s", e)
    
    def _inject_card_styles(self, card):
        """Injiziert CSS für modernes Card-Design"""
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                logger.error("❌ card_tracker: mw oder mw.reviewer nicht verfügbar")
                return
            
            logger.debug("🎨 card_tracker: _inject_card_styles aufgerufen für Karte %s", card.id)
            
            # Lade Minimal CSS-Datei (CSS-Only Styling) — cached after first read
            global _css_cache
            addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            css_path = os.path.join(addon_dir, 'reviewer_minimal.css')

            if _css_cache is None:
                try:
                    with open(css_path, 'r', encoding='utf-8') as f:
                        _css_cache = f.read()
                except FileNotFoundError:
                    logger.error("❌ card_tracker: CSS-Datei nicht gefunden: %s", css_path)
                    return

            css_content = _css_cache

            logger.debug("card_tracker: CSS geladen - %s Zeichen", len(css_content))
            
            # CSS + Direktes Inline-Styling für Container (höchste Priorität)
            css_js = f"""
            (function() {{
                // 1. CSS injizieren
                const oldStyle = document.getElementById('anki-minimal-styles');
                if (oldStyle) oldStyle.remove();
                
                const style = document.createElement('style');
                style.id = 'anki-minimal-styles';
                style.textContent = {json.dumps(css_content)};
                document.head.appendChild(style);
                
                // 2. DIREKTES Inline-Styling für Container (kann nicht überschrieben werden)
                function forceContainerTransparent() {{
                    // #qa und alle Kinder transparent
                    const qa = document.getElementById('qa');
                    if (qa) {{
                        qa.style.setProperty('background', 'transparent', 'important');
                        qa.style.setProperty('background-color', 'transparent', 'important');
                        
                        // Alle Kinder von #qa transparent
                        qa.querySelectorAll('*').forEach(el => {{
                            el.style.setProperty('background', 'transparent', 'important');
                            el.style.setProperty('background-color', 'transparent', 'important');
                            el.style.setProperty('border', 'none', 'important');
                            el.style.setProperty('box-shadow', 'none', 'important');
                        }});
                    }}
                    
                    // Body und HTML auf canvas background
                    document.documentElement.style.setProperty('background', 'var(--ds-bg-canvas)', 'important');
                    document.body.style.setProperty('background', 'var(--ds-bg-canvas)', 'important');
                    
                    // Alle Tables transparent
                    document.querySelectorAll('table, tbody, tr, td').forEach(el => {{
                        el.style.setProperty('background', 'transparent', 'important');
                        el.style.setProperty('background-color', 'transparent', 'important');
                    }});
                }}
                
                // Sofort anwenden
                forceContainerTransparent();
                
                // Und mehrfach nach Delays (für dynamisch geladene Elemente)
                setTimeout(forceContainerTransparent, 100);
                setTimeout(forceContainerTransparent, 300);
                setTimeout(forceContainerTransparent, 500);
                setTimeout(forceContainerTransparent, 1000);
                
                console.log('✅ anki-minimal: CSS + Inline-Styling injiziert');
            }})();
            """
            
            # Verwende reviewer.web.eval() für Injection
            has_web = hasattr(mw.reviewer, 'web') and mw.reviewer.web
            logger.debug("🔍 card_tracker: has_web = %s", has_web)
            
            if has_web:
                logger.debug("📝 card_tracker: Führe JavaScript aus (%s Zeichen)", len(css_js))
                mw.reviewer.web.eval(css_js)
                logger.debug("card_tracker: CSS + JavaScript injiziert")
                
                # Test-Script laden (nach weiteren 200ms)
                test_script_path = os.path.join(addon_dir, 'test_css_injection.js')
                if os.path.exists(test_script_path):
                    with open(test_script_path, 'r', encoding='utf-8') as f:
                        test_js = f.read()
                    test_js_wrapped = f"setTimeout(function() {{ {test_js} }}, 300);"
                    mw.reviewer.web.eval(test_js_wrapped)
                    logger.debug("card_tracker: Test-Script injiziert")
            else:
                logger.error("❌ card_tracker: Reviewer web nicht verfügbar")
                    
        except Exception as e:
            logger.error("Fehler beim Injizieren von Card-Styles: %s", e)
    
    def _inject_mc_script(self, card):
        """Injiziert JavaScript für MC-Integration"""
        try:
            from aqt import mw
            if not mw or not mw.reviewer:
                return
            
            # Lade JavaScript-Dateien (nur einmal)
            if not self.js_injected:
                addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

                # Lade Premium JS (Interaktivität - falls vorhanden)
                premium_js_path = os.path.join(addon_dir, 'reviewer_premium.js')
                if os.path.exists(premium_js_path):
                    with open(premium_js_path, 'r', encoding='utf-8') as f:
                        premium_js_content = f.read()
                    
                    if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                        mw.reviewer.web.eval(premium_js_content)
                        logger.debug("card_tracker: Premium JS injiziert")
                
                # Lade MC-Injector JS (für Multiple Choice)
                mc_js_path = os.path.join(addon_dir, 'card_mc_injector.js')
                if os.path.exists(mc_js_path):
                    with open(mc_js_path, 'r', encoding='utf-8') as f:
                        mc_js_content = f.read()
                    
                    if hasattr(mw.reviewer, 'web') and mw.reviewer.web:
                        mw.reviewer.web.eval(mc_js_content)
                        logger.debug("card_tracker: MC-JS injiziert")
                
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
                logger.debug("card_tracker: Reviewer web nicht verfügbar")
                    
        except Exception as e:
            logger.error("Fehler beim Injizieren von MC-Script: %s", e)

