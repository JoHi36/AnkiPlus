"""
Card HTML Transformer
Transformiert Anki's Standard-Card-HTML in Premium "Anki auf Steroiden" Layout
"""

import re
import html as html_module
from typing import Optional


def transform_card_html(text: str, card, kind: str) -> str:
    """
    Transformiert Anki's Card-HTML in Premium-Layout.
    
    Args:
        text: Das HTML, das Anki generiert hat
        card: Card-Objekt
        kind: "Question" oder "Answer" (oder "reviewQuestion", "reviewAnswer")
    
    Returns:
        Transformiertes HTML mit Premium-Layout
    """
    try:
        # Fallback: Wenn Transformation fehlschlägt, gebe Original zurück
        if not text or not card:
            return text
        
        # Nur im Reviewer transformieren (nicht im Editor oder Previewer)
        # Prüfe ob wir im Reviewer-Kontext sind
        from aqt import mw
        if mw and hasattr(mw, 'state'):
            # Nur transformieren wenn im Reviewer
            if mw.state != "review":
                return text  # Nicht im Reviewer, gebe Original zurück
        
        # Hole Card-Metadaten
        note = card.note()
        tags = note.tags if hasattr(note, 'tags') else []
        deck_name = _get_deck_name(card)
        
        # Parse HTML (kind kann "Question"/"Answer" oder "reviewQuestion"/"reviewAnswer" sein)
        is_question = kind.lower() in ["question", "reviewquestion"]
        is_answer = kind.lower() in ["answer", "reviewanswer"]
        
        question_html = text if is_question else None
        answer_html = text if is_answer else None
        
        # Bereinige HTML (entferne Anki's Standard-Wrapper)
        question_clean = _clean_html(question_html) if question_html else ""
        answer_clean = _clean_html(answer_html) if answer_html else ""
        
        # Baue Premium-Layout
        if is_question:
            return _build_question_layout(question_clean, tags, deck_name, card)
        else:  # answer
            return _build_answer_layout(answer_clean, tags, deck_name, card)
            
    except Exception as e:
        import traceback
        print(f"Fehler in transform_card_html: {e}")
        print(traceback.format_exc())
        # Fallback: Original-HTML zurückgeben
        return text


def _get_deck_name(card) -> str:
    """Holt Deck-Namen für eine Karte"""
    try:
        from aqt import mw
        if mw and mw.col:
            deck = mw.col.decks.get(card.did)
            if deck:
                return deck.get('name', 'DEFAULT')
    except:
        pass
    return "DEFAULT"


def _clean_html(html: str) -> str:
    """
    Bereinigt Anki's HTML und extrahiert den Content.
    Entfernt Anki's Standard-Wrapper, behält aber den Content.
    """
    if not html:
        return ""
    
    # Entferne Anki's Standard-Wrapper (falls vorhanden)
    # Anki wrappt oft in <div class="card"> oder ähnliches
    html = re.sub(r'<div[^>]*class="[^"]*card[^"]*"[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</div>\s*$', '', html)
    
    # Entferne leere Wrapper
    html = html.strip()
    
    # Stelle sicher, dass HTML valide ist (mindestens ein Tag)
    if html and not html.strip().startswith('<'):
        # Wenn kein HTML-Tag, wrappe in <p>
        html = f'<p>{html}</p>'
    
    return html


def _build_question_layout(question_html: str, tags: list, deck_name: str, card) -> str:
    """Baut Ultra-Minimal Layout für Question-Seite"""
    
    # Question HTML (bereits bereinigt)
    question_content = question_html if question_html else "<p>Keine Frage verfügbar</p>"
    
    # Show Answer Button - Minimal
    show_answer_btn = '''
    <button class="anki-btn-show-answer" onclick="if(window.pycmd)window.pycmd('ans');">
        <span>Antwort anzeigen</span>
    </button>
    '''
    
    # Ultra-Minimal Layout - Keine Tags, kein Deck Info
    premium_html = f'''
    <div id="anki-premium-container" class="anki-premium-root">
        <!-- Plugin Zone (Reserved for AMBOSS, Meditricks, etc.) -->
        <div id="plugin-zone" class="anki-plugin-zone"></div>
        
        <!-- Main Content - Pure -->
        <div class="anki-premium-card">
            <!-- Question Panel -->
            <div class="anki-question-panel">
                <h1 class="anki-question-title">
                    {question_content}
                </h1>
                <!-- Decorative Line -->
                <div class="anki-decorative-line"></div>
            </div>
            
            <!-- Actions Bar -->
            <div class="anki-actions-bar">
                {show_answer_btn}
            </div>
        </div>
    </div>
    '''
    
    return premium_html


def _build_answer_layout(answer_html: str, tags: list, deck_name: str, card) -> str:
    """Baut Ultra-Minimal Layout für Answer-Seite"""
    
    # Answer HTML (bereits bereinigt, mit Markdown-Processing)
    answer_content = _process_markdown(answer_html) if answer_html else "<p>Keine Antwort verfügbar</p>"
    
    # Hole Question für Answer-Layout (wird oben angezeigt)
    try:
        question_html = card.question()
        question_clean = _clean_html(question_html)
    except:
        question_clean = ""
    
    # Rating Buttons
    rating_buttons = _build_rating_buttons(card)
    
    # Ultra-Minimal Layout
    premium_html = f'''
    <div id="anki-premium-container" class="anki-premium-root">
        <!-- Plugin Zone -->
        <div id="plugin-zone" class="anki-plugin-zone"></div>
        
        <!-- Main Content - Pure -->
        <div class="anki-premium-card">
            <!-- Question Panel (bleibt sichtbar) -->
            <div class="anki-question-panel">
                <h1 class="anki-question-title">
                    {question_clean if question_clean else "Frage"}
                </h1>
                <div class="anki-decorative-line"></div>
            </div>
            
            <!-- Answer Panel - Pure Text -->
            <div class="anki-answer-panel">
                {answer_content}
            </div>
            
            <!-- Actions Bar -->
            <div class="anki-actions-bar">
                {rating_buttons}
            </div>
        </div>
    </div>
    '''
    
    return premium_html


def _process_markdown(html: str) -> str:
    """
    Verarbeitet HTML und fügt Chat-ähnliche Markdown-Styles hinzu.
    Bold = Textmarker-Effekt, etc.
    """
    if not html:
        return html
    
    # HTML ist bereits HTML (von Anki), keine weitere Verarbeitung nötig
    # CSS übernimmt das Styling für <strong>, <em>, etc.
    return html


def _build_rating_buttons(card) -> str:
    """Baut moderne Rating-Buttons mit Intervals"""
    try:
        from aqt import mw
        from anki.sched import Scheduler
        
        intervals = {}
        
        if mw and mw.reviewer and mw.col:
            reviewer = mw.reviewer
            scheduler = mw.col.sched
            
            # Versuche Intervals aus Scheduler zu berechnen
            try:
                # Anki's Scheduler hat Methoden für Button-Intervals
                # Versuche _buttonTime() oder ähnliche Methoden
                if hasattr(scheduler, '_buttonTime'):
                    # Calculate intervals for each ease
                    intervals[1] = _format_interval(scheduler._buttonTime(1))  # Again
                    intervals[2] = _format_interval(scheduler._buttonTime(2))  # Hard
                    intervals[3] = _format_interval(scheduler._buttonTime(3))  # Good
                    intervals[4] = _format_interval(scheduler._buttonTime(4))  # Easy
                elif hasattr(reviewer, '_bottom') and reviewer._bottom:
                    # Fallback: Parse from HTML
                    intervals = _extract_intervals_from_reviewer(reviewer)
            except:
                # Fallback: Use card's next interval estimates
                try:
                    # Calculate based on card state
                    ivl = card.ivl if hasattr(card, 'ivl') else 0
                    if ivl > 0:
                        intervals[1] = "1m"
                        intervals[2] = _format_interval(ivl * 0.5)
                        intervals[3] = _format_interval(ivl)
                        intervals[4] = _format_interval(ivl * 2)
                except:
                    pass
        
        # Final fallback: Standard intervals
        if not intervals:
            intervals = {
                1: "1m",
                2: "10m",
                3: "4d",
                4: "21d"
            }
    except:
        # Fallback bei Fehler
        intervals = {
            1: "1m",
            2: "10m",
            3: "4d",
            4: "21d"
        }
    
    # Button-Definitionen
    buttons_config = [
        ('again', 'Nochmal', intervals.get(1, "1m"), 1),
        ('hard', 'Schwer', intervals.get(2, "10m"), 2),
        ('good', 'Gut', intervals.get(3, "4d"), 3),
        ('easy', 'Einfach', intervals.get(4, "21d"), 4)
    ]
    
    buttons_html = ""
    for ease_name, label, interval, ease_num in buttons_config:
        buttons_html += f'''
        <button class="anki-btn-rating {ease_name}" data-ease="{ease_num}" onclick="if(window.pycmd)window.pycmd('ease{ease_num}');">
            <span class="label">{html_module.escape(label)}</span>
            <span class="interval">{html_module.escape(interval)}</span>
        </button>
        '''
    
    return buttons_html


def _format_interval(seconds: float) -> str:
    """
    Formatiert Interval in Sekunden zu lesbarem Format (1m, 4d, etc.)
    """
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes}m"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours}h"
    else:
        days = int(seconds / 86400)
        if days < 30:
            return f"{days}d"
        else:
            months = int(days / 30)
            return f"{months}mo" if months < 12 else f"{int(days / 365)}y"


def _extract_intervals_from_reviewer(reviewer) -> dict:
    """
    Extrahiert Button-Intervals aus Reviewer.
    Versucht verschiedene Methoden, um die Intervals zu bekommen.
    """
    intervals = {}
    
    try:
        # Methode 1: Reviewer hat _bottom HTML mit Intervals
        if hasattr(reviewer, '_bottom') and reviewer._bottom:
            # Parse HTML für Interval-Text
            # Format ist meist: "10m", "4d", etc.
            interval_pattern = r'(\d+[smhd]|\d+\.\d+[smhd]|\d+\s*(min|sec|hour|day|d|h|m|s))'
            matches = re.findall(interval_pattern, reviewer._bottom, re.IGNORECASE)
            if len(matches) >= 4:
                # Clean matches
                clean_matches = []
                for match in matches:
                    if isinstance(match, tuple):
                        clean_matches.append(match[0])
                    else:
                        clean_matches.append(match)
                
                intervals = {
                    1: clean_matches[0] if len(clean_matches) > 0 else "1m",
                    2: clean_matches[1] if len(clean_matches) > 1 else "10m",
                    3: clean_matches[2] if len(clean_matches) > 2 else "4d",
                    4: clean_matches[3] if len(clean_matches) > 3 else "21d"
                }
    except:
        pass
    
    # Fallback: Standard-Intervals
    if not intervals:
        intervals = {
            1: "1m",
            2: "10m",
            3: "4d",
            4: "21d"
        }
    
    return intervals
