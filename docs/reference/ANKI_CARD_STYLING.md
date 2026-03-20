# Anki Card Styling - Technische Dokumentation

Diese Dokumentation beschreibt, wie Anki Card Styling funktioniert und wie man die vollständige Kontrolle über das Erscheinungsbild von Karten aus verschiedenen Decks erhält.

## Inhaltsverzeichnis

1. [Grundlagen: Wie Anki Karten rendert](#grundlagen)
2. [Das CSS Cascade Problem](#cascade-problem)
3. [Deck-spezifisches CSS](#deck-css)
4. [Lösungsansätze](#lösungsansätze)
5. [Style-Transformation System (Zukunft)](#style-transformation)
6. [Best Practices](#best-practices)

---

## 1. Grundlagen: Wie Anki Karten rendert {#grundlagen}

### HTML-Struktur einer Anki-Karte

Wenn Anki eine Karte rendert, wird der HTML-Code in mehreren Schritten zusammengebaut:

```python
# In custom_reviewer/__init__.py:256-322
question_html = card.question()  # Gibt FERTIGEN HTML-Code zurück
answer_html = card.answer()       # Gibt FERTIGEN HTML-Code zurück
```

**Wichtig:** `card.question()` und `card.answer()` geben **bereits gerenderten HTML-Code** zurück, der **CSS `<style>` Tags enthält**!

### Beispiel: AMBOSS Deck

Der von `card.question()` zurückgegebene HTML sieht so aus:

```html
<style>
.card {
    background: #EEEEEE !important;
}
.card.nightMode {
    background: #2F2F31 !important;
}
/* ... weitere Deck-spezifische Styles ... */
</style>

<div id="qa">
    <div class="card">
        <!-- Karteninhalt hier -->
    </div>
</div>
```

Das CSS ist also **TEIL des Karteninhalts**, nicht separat!

### Der Render-Prozess

1. **Template laden** (`template.html` oder `_build_inline_html()`)
2. **Custom Reviewer CSS einfügen** (im `<head>` als `<style>{{CSS}}</style>`)
3. **Karteninhalt einfügen** (`{{QUESTION}}` und `{{ANSWER}}` werden ersetzt)
   - **Hier wird das Deck CSS eingefügt!**
4. **JavaScript einfügen** (am Ende des `<body>`)

**Finale HTML-Struktur:**

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Custom Reviewer CSS - ZUERST */
        .card { background: transparent !important; }
    </style>
</head>
<body>
    <div class="canvas">
        <article class="card">
            <section class="question">
                <!-- Hier wird {{QUESTION}} eingefügt -->
                <style>
                    /* AMBOSS CSS - KOMMT DANACH! */
                    .card { background: #EEEEEE !important; }
                </style>
                <div class="card">Frage...</div>
            </section>
        </article>
    </div>
</body>
</html>
```

---

## 2. Das CSS Cascade Problem {#cascade-problem}

### CSS Cascade Order Regeln

CSS folgt diesen Regeln (in Reihenfolge der Priorität):

1. **Inline Styles** (`style="..."`) - höchste Priorität
2. **`!important` Regeln** - sehr hohe Priorität
3. **Spezifität** (je spezifischer der Selektor, desto höher die Priorität)
4. **Quellreihenfolge** - **später im Dokument = höher**

### Das Problem

Wenn BEIDE Custom Reviewer CSS UND Deck CSS `!important` verwenden:

```css
/* Custom Reviewer CSS (im <head>) */
.card { background: transparent !important; }  /* Kommt ZUERST */

/* AMBOSS Deck CSS (im <body>) */
.card { background: #EEEEEE !important; }      /* Kommt DANACH → GEWINNT! */
```

**Ergebnis:** AMBOSS CSS gewinnt, weil es **später** in der Cascade kommt!

### Warum bisherige Fixes nicht funktioniert haben

#### Versuch 1: Höhere Spezifität

```css
/* Custom Reviewer CSS */
body .card { background: transparent !important; }
```

**Problem:** Höhere Spezifität hilft NICHT gegen spätere `!important` Regeln!

#### Versuch 2: Mehr `!important` Tags

```css
.card {
    background: transparent !important;
    background-color: transparent !important;
}
```

**Problem:** Hilft nicht, wenn das Deck CSS trotzdem später kommt!

#### Versuch 3: CSS in `{{CSS}}` Placeholder

```python
html = html.replace('{{CSS}}', css)
```

**Problem:** Der `{{CSS}}` Placeholder ist im `<head>` - kommt trotzdem VOR dem Deck CSS im `<body>`!

---

## 3. Deck-spezifisches CSS {#deck-css}

### Wo kommt das Deck CSS her?

Deck CSS wird in Anki unter **Tools → Manage Note Types → [Note Type] → Cards → Styling** definiert.

**Beispiel AMBOSS Deck CSS:**

```css
.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background: #EEEEEE !important;
}

.card.nightMode {
    color: white;
    background: #2F2F31 !important;
}

/* Spezifische AMBOSS Styles */
.amboss-box { background: #fff; padding: 10px; }
.amboss-highlight { background: #ffeb3b; }
```

### Wie wird es eingefügt?

Anki fügt das Deck CSS automatisch in `card.question()` und `card.answer()` ein:

```python
# Anki interner Code (vereinfacht)
def question(self):
    css = self.note_type().get_styling()
    html = f"<style>{css}</style>\n{self.template_question}"
    return html
```

### Verschiedene Deck-Typen

Jedes Deck kann unterschiedliches CSS haben:

| Deck | CSS Eigenschaft | Hintergrund |
|------|----------------|-------------|
| **AMBOSS** | `.card { background: #EEEEEE !important; }` | Hellgrau |
| **AnKing** | `.card { background: #fff; }` | Weiß |
| **Standard Anki** | Kein spezifisches CSS | Browser-Standard |
| **Eigene Decks** | Variabel | Benutzerdefiniert |

---

## 4. Lösungsansätze {#lösungsansätze}

### Lösung 1: Override CSS am Ende des `<body>` (AKTUELLE LÖSUNG)

**Prinzip:** CSS am **ENDE** des `<body>` Tags einfügen, damit es **zuletzt** in der Cascade kommt.

**Implementierung:**

```python
# custom_reviewer/__init__.py:322-336
override_css = """
<style>
/* FORCE TRANSPARENCY: Override AMBOSS deck background */
.card,
.card.nightMode,
#qa,
.card-container {
    background: transparent !important;
    background-color: transparent !important;
}
</style>"""
# Insert before closing body tag to ensure it's last in cascade
html = html.replace('</body>', override_css + '</body>')
```

**Cascade Order:**

```
1. Custom Reviewer CSS (<head>)
2. AMBOSS CSS (im <body>, in {{QUESTION}})
3. Override CSS (am Ende des <body>) ← GEWINNT!
```

**Vorteile:**
- ✅ Funktioniert garantiert (kommt zuletzt)
- ✅ Einfach zu implementieren
- ✅ Funktioniert für alle Decks
- ✅ Kein Template-Änderung nötig

**Nachteile:**
- ❌ Überschreibt ALLE `.card` Hintergründe (auch gewollte)
- ❌ Nicht deck-spezifisch

### Lösung 2: Deck CSS entfernen (RISKANT)

**Prinzip:** Entferne das `<style>` Tag aus `question_html` und `answer_html` mit Regex.

```python
import re

# Remove deck CSS from card HTML
question_html = re.sub(r'<style>.*?</style>', '', question_html, flags=re.DOTALL)
answer_html = re.sub(r'<style>.*?</style>', '', answer_html, flags=re.DOTALL)
```

**Vorteile:**
- ✅ Vollständige Kontrolle über Styles

**Nachteile:**
- ❌ Entfernt auch wichtige Deck-Styles (z.B. AMBOSS Boxen, Highlights)
- ❌ Regex ist fragil (könnte legitime `<style>` Tags in Karteninhalt entfernen)
- ❌ Karten könnten unlesbar werden

**Fazit:** Nicht empfohlen!

### Lösung 3: Inline Styles mit JavaScript (FALLBACK)

**Prinzip:** JavaScript setzt Styles direkt nach dem Laden der Seite.

```javascript
// In interactions.js
window.addEventListener('DOMContentLoaded', function() {
    const card = document.querySelector('.card');
    if (card) {
        card.style.background = 'transparent';
        card.style.backgroundColor = 'transparent';
    }
});
```

**Vorteile:**
- ✅ Inline styles haben höchste Priorität (außer `!important`)
- ✅ Funktioniert als Fallback

**Nachteile:**
- ❌ Wird NACH dem CSS ausgeführt (kurzer Flash der alten Farbe möglich)
- ❌ JavaScript kann deaktiviert sein

**Fazit:** Guter Fallback, aber nicht die primäre Lösung!

### Lösung 4: Deck CSS transformieren (ZUKÜNFTIG)

**Prinzip:** Deck CSS parsen, transformieren und mit Custom Styles mergen.

Siehe [Style-Transformation System](#style-transformation) unten.

---

## 5. Style-Transformation System (Zukunft) {#style-transformation}

### Vision

Ein System, das Deck-spezifische Styles **transformiert** statt sie zu überschreiben:

```python
# Pseudo-Code
deck_css = extract_deck_css(question_html)
transformed_css = style_transformer.transform(deck_css, deck_name="AMBOSS")
question_html_clean = remove_deck_css(question_html)
final_html = inject_css(transformed_css, question_html_clean)
```

### Komponenten

#### 5.1 CSS Extractor

Extrahiert CSS aus Karten-HTML:

```python
def extract_deck_css(card_html: str) -> str:
    """Extract <style> tags from card HTML"""
    import re
    match = re.search(r'<style>(.*?)</style>', card_html, re.DOTALL)
    return match.group(1) if match else ""
```

#### 5.2 Style Transformer

Transformiert Deck CSS basierend auf Regeln:

```python
class StyleTransformer:
    def __init__(self):
        self.transformations = {
            "AMBOSS": self._transform_amboss,
            "AnKing": self._transform_anking,
            "default": self._transform_default
        }

    def transform(self, css: str, deck_name: str) -> str:
        """Transform deck CSS based on deck-specific rules"""
        transformer = self.transformations.get(deck_name, self._transform_default)
        return transformer(css)

    def _transform_amboss(self, css: str) -> str:
        """AMBOSS-spezifische Transformationen"""
        # Entferne .card Hintergrund
        css = re.sub(
            r'\.card\s*{[^}]*background:[^;]+;',
            '.card { background: transparent;',
            css
        )
        # Behalte .amboss-box Hintergrund
        # ... weitere Regeln
        return css

    def _transform_default(self, css: str) -> str:
        """Fallback: Entferne alle Hintergründe"""
        css = re.sub(r'background(-color)?:\s*[^;]+;', '', css)
        return css
```

#### 5.3 Deck Detector

Erkennt Deck-Typ automatisch:

```python
def detect_deck_type(card_html: str, deck_name: str) -> str:
    """Detect deck type from HTML content or deck name"""
    if "amboss" in deck_name.lower() or "amboss-box" in card_html:
        return "AMBOSS"
    elif "anking" in deck_name.lower():
        return "AnKing"
    else:
        return "default"
```

#### 5.4 CSS Merger

Merged Custom Reviewer CSS mit transformiertem Deck CSS:

```python
def merge_css(custom_css: str, deck_css: str) -> str:
    """Merge custom reviewer CSS with transformed deck CSS"""
    return f"""
    /* Custom Reviewer Styles */
    {custom_css}

    /* Transformed Deck Styles */
    {deck_css}
    """
```

### Implementierung

**Neue Datei:** `custom_reviewer/style_transformer.py`

```python
import re
from typing import Dict, Callable

class DeckStyleTransformer:
    """
    Transforms deck-specific CSS to work with custom reviewer.
    Allows deck-specific styling while maintaining custom reviewer design.
    """

    def __init__(self):
        self.transformers: Dict[str, Callable] = {
            "amboss": self._transform_amboss,
            "anking": self._transform_anking,
            "default": self._transform_default
        }

    def transform(self, card_html: str, deck_name: str) -> tuple[str, str]:
        """
        Extract and transform CSS from card HTML.

        Returns:
            tuple: (cleaned_html, transformed_css)
        """
        # Extract deck CSS
        deck_css = self._extract_css(card_html)

        # Remove CSS from HTML
        cleaned_html = self._remove_css(card_html)

        # Detect deck type
        deck_type = self._detect_deck_type(deck_name, card_html)

        # Transform CSS
        transformer = self.transformers.get(deck_type, self._transform_default)
        transformed_css = transformer(deck_css)

        return cleaned_html, transformed_css

    def _extract_css(self, html: str) -> str:
        """Extract all <style> tags from HTML"""
        matches = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
        return '\n'.join(matches)

    def _remove_css(self, html: str) -> str:
        """Remove all <style> tags from HTML"""
        return re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)

    def _detect_deck_type(self, deck_name: str, html: str) -> str:
        """Auto-detect deck type"""
        deck_lower = deck_name.lower()
        if "amboss" in deck_lower or "amboss-box" in html:
            return "amboss"
        elif "anking" in deck_lower:
            return "anking"
        return "default"

    def _transform_amboss(self, css: str) -> str:
        """Transform AMBOSS deck CSS"""
        # Remove .card background
        css = re.sub(
            r'\.card\s*\{[^}]*\}',
            lambda m: re.sub(r'background(-color)?:\s*[^;]+;', '', m.group(0)),
            css
        )

        # Keep .amboss-box and .amboss-highlight styles
        # (they're already specific enough)

        return css

    def _transform_anking(self, css: str) -> str:
        """Transform AnKing deck CSS"""
        # Similar to AMBOSS
        css = re.sub(
            r'\.card\s*\{[^}]*\}',
            lambda m: re.sub(r'background(-color)?:\s*[^;]+;', '', m.group(0)),
            css
        )
        return css

    def _transform_default(self, css: str) -> str:
        """Default transformation: Remove all backgrounds"""
        css = re.sub(r'background(-color)?:\s*[^;]+;', '', css)
        return css
```

**Integration in `custom_reviewer/__init__.py`:**

```python
from .style_transformer import DeckStyleTransformer

class CustomReviewer:
    def __init__(self):
        # ... existing code ...
        self.style_transformer = DeckStyleTransformer()

    def _build_reviewer_html(self, card, reviewer) -> str:
        """Generate completely custom HTML for the reviewer"""
        # Get card content
        question_html = card.question()
        answer_html = card.answer()

        # Get deck name
        deck_name = mw.col.decks.name(card.did) if mw and mw.col else ""

        # Transform deck CSS
        question_html_clean, question_deck_css = self.style_transformer.transform(
            question_html, deck_name
        )
        answer_html_clean, answer_deck_css = self.style_transformer.transform(
            answer_html, deck_name
        )

        # Merge deck CSS
        deck_css = question_deck_css + "\n" + answer_deck_css

        # Load custom CSS
        custom_css = self._load_css()

        # Combine CSS
        combined_css = custom_css + "\n\n/* Transformed Deck CSS */\n" + deck_css

        # ... rest of the function uses question_html_clean, answer_html_clean, combined_css ...
```

### Vorteile des Transformation-Systems

- ✅ Deck-spezifische Kontrolle
- ✅ Wichtige Deck-Styles bleiben erhalten (z.B. AMBOSS Boxen)
- ✅ Kein "Override alles" mehr nötig
- ✅ Erweiterbar für neue Decks
- ✅ Automatische Deck-Erkennung

### Nachteile

- ❌ Komplexer
- ❌ Regex-basiert (kann fragil sein)
- ❌ Muss für jedes neue Deck angepasst werden

---

## 6. Best Practices {#best-practices}

### DO's ✅

1. **CSS am Ende des Body einfügen** für globale Overrides
2. **Deck-spezifische Transformationen** für präzise Kontrolle
3. **Deck CSS extrahieren** vor dem Transformieren
4. **Wichtige Deck-Styles beibehalten** (z.B. `.amboss-box`)
5. **Automatische Deck-Erkennung** nutzen
6. **Fallback-Styles** definieren für unbekannte Decks

### DON'Ts ❌

1. **Nicht einfach alles mit `!important` überschreiben**
2. **Nicht komplett Deck CSS entfernen** (zerstört Karten-Layout)
3. **Nicht auf Inline-Styles verlassen** (funktioniert nicht gegen `!important`)
4. **Nicht höhere Spezifität als Lösung** (hilft nicht gegen spätere `!important`)
5. **Nicht vergessen, dass `card.question()` bereits gerendert ist**

### CSS Debugging Tipps

#### 1. DevTools verwenden

```javascript
// In Anki Developer Console (Ctrl/Cmd + Shift + I)
// Zeige alle Styles für .card
const card = document.querySelector('.card');
console.log(window.getComputedStyle(card).background);

// Zeige alle <style> Tags
document.querySelectorAll('style').forEach((s, i) => {
    console.log(`Style ${i}:`, s.textContent);
});
```

#### 2. CSS Cascade visualisieren

Füge temporär verschiedene Border-Farben ein, um zu sehen, welches CSS gewinnt:

```css
/* Im Custom Reviewer CSS */
.card { border: 5px solid red !important; }

/* Im Override CSS */
.card { border: 5px solid green !important; }
```

Wenn grün sichtbar ist → Override gewinnt! ✅

#### 3. HTML-Struktur inspizieren

```python
# In custom_reviewer/__init__.py debug output
print("=" * 80)
print("QUESTION HTML:")
print(question_html[:500])  # Erste 500 Zeichen
print("=" * 80)
```

### Performance-Überlegungen

1. **CSS Caching:** Cache transformierte Styles pro Deck
2. **Lazy Transformation:** Nur transformieren, wenn nötig
3. **Regex Optimierung:** Kompilierte Regex-Patterns verwenden

```python
class DeckStyleTransformer:
    def __init__(self):
        # Kompiliere Regex einmal
        self._style_regex = re.compile(r'<style[^>]*>(.*?)</style>', re.DOTALL)
        self._bg_regex = re.compile(r'background(-color)?:\s*[^;]+;')
        # ... cache für transformierte Styles
        self._transform_cache: Dict[str, str] = {}
```

---

## Zusammenfassung

### Aktuelle Lösung (v1.0)

**Override CSS am Ende des `<body>`:**

```python
override_css = """<style>
.card { background: transparent !important; }
</style>"""
html = html.replace('</body>', override_css + '</body>')
```

**Status:** ✅ Funktioniert für alle Decks, aber nicht deck-spezifisch.

### Zukünftige Lösung (v2.0)

**Style-Transformation System:**

1. CSS aus Karten-HTML extrahieren
2. Deck-Typ erkennen (AMBOSS, AnKing, etc.)
3. Deck-spezifische Transformationen anwenden
4. Transformiertes CSS mit Custom CSS mergen
5. Gereinigten HTML-Inhalt mit kombiniertem CSS rendern

**Status:** 📋 Geplant, Design dokumentiert.

---

## Appendix: Useful Code Snippets

### CSS extrahieren

```python
import re

def extract_css(html: str) -> str:
    matches = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL)
    return '\n'.join(matches)
```

### CSS entfernen

```python
def remove_css(html: str) -> str:
    return re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
```

### Background-Regeln entfernen

```python
def remove_backgrounds(css: str) -> str:
    return re.sub(r'background(-color)?:\s*[^;]+;', '', css)
```

### Deck-Typ erkennen

```python
def detect_deck(deck_name: str, html: str) -> str:
    if "amboss" in deck_name.lower() or "amboss-box" in html:
        return "AMBOSS"
    elif "anking" in deck_name.lower():
        return "AnKing"
    return "default"
```

---

**Letzte Aktualisierung:** 2026-01-19
**Version:** 1.0
**Autor:** Claude Code Analysis
