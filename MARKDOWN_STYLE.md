# Markdown-Styling im Anki Chatbot

## Verwendeter Markdown-Stil

Wir verwenden **GitHub Flavored Markdown (GFM)** - den Standard-Markdown-Stil, der auch von GitHub, GitLab und vielen anderen Plattformen verwendet wird.

### Warum GFM?

- ✅ **Sauber und professionell**: Der am weitesten verbreitete Markdown-Stil
- ✅ **Umfassend**: Unterstützt alle wichtigen Features (Tabellen, Code-Blöcke, etc.)
- ✅ **Konsistent**: Gleicher Stil wie in modernen Chat-Interfaces (Gemini, ChatGPT, etc.)
- ✅ **Wartbar**: Standard-Bibliothek (`remark-gfm`) mit guter Unterstützung

## Unterstützte Markdown-Features

### Überschriften
```markdown
# H1 Überschrift
## H2 Überschrift
### H3 Überschrift
```

### Listen
```markdown
- Ungeordnete Liste
- Zweiter Punkt

1. Geordnete Liste
2. Zweiter Punkt
```

### Code-Blöcke
````markdown
```python
def beispiel():
    return "Hallo"
```
````

### Inline-Code
```markdown
Verwende `variablen_name` für die Variable.
```

### Tabellen (GFM)
```markdown
| Spalte 1 | Spalte 2 | Spalte 3 |
|----------|----------|----------|
| Wert 1   | Wert 2   | Wert 3   |
| Wert 4   | Wert 5   | Wert 6   |
```

### Blockquotes
```markdown
> Wichtiger Hinweis oder Zitat
```

### Formatierung
```markdown
**Fettdruck** und *Kursiv*
~~Durchgestrichen~~ (GFM)
```

### Links
```markdown
[Link-Text](https://example.com)
```

### Horizontale Linien
```markdown
---
```

## Tabellen-Stil

Wir verwenden den **Standard GFM-Tabellen-Stil** mit:
- Klaren Borders zwischen Zellen
- Hover-Effekt auf Zeilen
- Responsive Design (Scrollbar bei Bedarf)
- Dark-Theme-optimiert

**Beispiel:**
```markdown
| Feature | Status | Notizen |
|---------|--------|---------|
| Markdown | ✅ | Vollständig unterstützt |
| Code-Highlighting | ✅ | Mit Syntax-Highlighting |
| Tabellen | ✅ | GFM-Stil |
```

## Alternative Tabellen-Stile (nicht verwendet)

Es gibt verschiedene Tabellen-Stile in Markdown:

1. **GFM-Tabellen** (verwendet) ✅
   - Klare Struktur mit `|` Trennzeichen
   - Einfach zu lesen und zu schreiben
   - Standard in modernen Markdown-Parsern

2. **HTML-Tabellen**
   - Mehr Kontrolle, aber weniger lesbar im Quelltext
   - Nicht so "clean" für Chat-Interfaces

3. **CSV-ähnliche Tabellen**
   - Weniger verbreitet
   - Nicht so gut unterstützt

**Fazit**: GFM-Tabellen sind die beste Wahl für unseren Chatbot - sauber, professionell und gut lesbar.

## Syntax-Highlighting

Code-Blöcke verwenden **Prism.js** mit dem **vscDarkPlus** Theme:
- Professionelles Dark-Theme
- Unterstützt viele Programmiersprachen
- Konsistent mit VS Code

## Styling-Anpassungen

Das Markdown-Styling kann in `frontend/src/components/ChatMessage.jsx` angepasst werden. Die Komponenten verwenden Tailwind CSS-Klassen für konsistentes Styling.

