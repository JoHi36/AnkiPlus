# Anki Chatbot Addon - Design-Sprache

## Design-Philosophie

**Clean, modern, professionell, hochwertig** - inspiriert von Apps wie Wispr Flow und Cursor. Das Design soll Spaß machen, ohne aufdringlich zu sein, und nahtlos in Anki integriert sein.

## Design-Prinzipien

### 1. Minimalismus
- Klare, uncluttered Interfaces
- Fokus auf Inhalt, nicht auf Dekoration
- Genug Whitespace für Atmung

### 2. Konsistenz
- Einheitliche Farbpalette
- Konsistente Abstände und Größen
- Vorhersehbare Interaktionen

### 3. Funktionalität vor Form
- Jedes Design-Element hat einen Zweck
- Keine rein dekorativen Elemente
- Intuitive Bedienbarkeit

### 4. Modernität
- Aktuelle Design-Trends (aber nicht modisch)
- Zeitlose Ästhetik
- Professionelle Ausstrahlung

## Farbpalette

### Primärfarben
- **Primary Blue**: `#4a9eff` - Hauptakzentfarbe (Buttons, Links)
- **Primary Blue Hover**: `#5aaeff` - Hover-Zustand
- **Primary Blue Pressed**: `#3a8eef` - Aktiver Zustand

### Hintergrundfarben
- **Background Dark**: `#1e1e1e` - Haupt-Hintergrund (Chat-Display)
- **Background Medium**: `#252525` - Container-Hintergrund (Input-Bereich)
- **Background Light**: `#2d2d2d` - Input-Felder

### Textfarben
- **Text Primary**: `#e0e0e0` - Haupttext
- **Text Secondary**: `#888888` - Placeholder, sekundärer Text
- **Text Accent**: `#4a9eff` - Akzent-Text (Bot-Name)
- **Text User**: `#6bb6ff` - Benutzer-Name

### Nachrichten-Hintergründe
- **Bot Message**: `#2d3a4a` - Bot-Nachrichten (links)
- **User Message**: `#1a4a6e` - Benutzer-Nachrichten (rechts)
- **Border**: `#333333` - Trennlinien

## Typografie

### Schriftarten
- **System Font Stack**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Nutzt native System-Schriftarten für beste Performance und native Optik

### Schriftgrößen
- **Body Text**: `14px` - Haupttext in Nachrichten
- **Labels**: `12px` - Namen, Labels
- **Buttons**: `18px` - Button-Icons
- **FAB**: `24px` - Floating Action Button

### Zeilenhöhe
- **Standard**: `1.5` - Gute Lesbarkeit

## Komponenten

### Floating Action Button (FAB)
- **Größe**: 56x56px
- **Form**: Perfekter Kreis (border-radius: 28px)
- **Farbe**: Primary Blue mit Hover-Effekten
- **Position**: Obere rechte Ecke, immer sichtbar
- **Icon**: 💬 (Chat-Emoji)

### Chat-Panel (Dock-Widget)
- **Minimale Breite**: 350px
- **Maximale Breite**: 800px
- **Standard-Breite**: 450px
- **Resizable**: Ja, durch Ziehen am Rand
- **Position**: Links (LeftDockWidgetArea)

### Chat-Display
- **Hintergrund**: Dark Background (#1e1e1e)
- **Padding**: 16px
- **Scrollbar**: System-Standard (automatisch)

### Nachrichten-Bubbles
- **Bot-Nachrichten**:
  - Links positioniert (margin-right: 20%)
  - Hintergrund: #2d3a4a
  - Border-radius: 12px (oben-links: 4px)
  - Padding: 12px 16px
  
- **Benutzer-Nachrichten**:
  - Rechts positioniert (margin-left: 20%)
  - Hintergrund: #1a4a6e
  - Border-radius: 12px (oben-rechts: 4px)
  - Padding: 12px 16px

### Input-Bereich
- **Container**: Background Medium (#252525)
- **Border-Top**: 1px solid #333333
- **Padding**: 12px
- **Spacing**: 8px zwischen Elementen

### Input-Feld
- **Hintergrund**: #2d2d2d
- **Border**: 1px solid #3a3a3a
- **Border-radius**: 8px
- **Padding**: 10px 14px
- **Focus**: Border wird zu #4a9eff, Hintergrund zu #323232

### Send-Button
- **Größe**: 40x40px
- **Form**: Abgerundetes Rechteck (8px)
- **Icon**: → (Pfeil)
- **Farbe**: Primary Blue mit Hover-Effekten

## Abstände & Spacing

### Padding
- **Klein**: 8px
- **Medium**: 12px
- **Groß**: 16px

### Margins
- **Nachrichten**: 8px vertikal, 20% horizontal (für Alignment)
- **Container**: 0px (keine Außenabstände)

### Spacing (zwischen Elementen)
- **Klein**: 5px
- **Medium**: 8px
- **Groß**: 12px

## Interaktionen

### Hover-Effekte
- **Buttons**: Leichte Farbänderung (heller)
- **Input-Feld**: Border-Farbe ändert sich bei Focus

### Transitions
- Sanfte Übergänge (wo möglich)
- Keine abrupten Änderungen

### Feedback
- Visuelles Feedback bei allen Interaktionen
- Klare Zustände (normal, hover, pressed, focus)

## Responsive Verhalten

### Panel-Größe
- Nutzer kann Breite zwischen 350px und 800px anpassen
- Höhe passt sich automatisch an Fenstergröße an

### Button-Position
- FAB bleibt immer in oberer rechter Ecke
- Position passt sich bei Fenstergrößenänderung an

## Anpassungen an Anki

### Theme-Kompatibilität
- Aktuell: Dark Theme optimiert
- Sollte später auch Light Theme unterstützen
- Nutzt Anki's native Widget-Styling wo möglich

### Integration
- Dock-Widget fügt sich nahtlos in Anki ein
- Keine störenden Elemente
- Respektiert Anki's Layout

### Frontend-Implementierung

### Technologie-Stack

Das Design wird mit modernen Web-Technologien umgesetzt:

- **Tailwind CSS**: Alle Design-Tokens (Farben, Abstände, etc.) sind in `frontend/tailwind.config.js` definiert
- **DaisyUI**: Nutzt DaisyUI-Komponenten für schnelle UI-Entwicklung
- **React**: Komponenten-basierte Architektur für modulare UI-Bausteine

### Design-Tokens in Tailwind

Die Farbpalette und Design-Werte sind als Tailwind-Theme definiert:

```javascript
// tailwind.config.js
colors: {
  'bg-dark': '#121212',
  'bg-panel': '#1a1a1a',
  'bg-muted': '#252525',
  'text-primary': '#e8e8e8',
  'accent': '#14b8a6',
  // ...
}
```

### Layout-Architektur: Interaction Container

Um ein flüssiges Chat-Erlebnis zu gewährleisten, bei dem die aktuelle Interaktion im Fokus steht, wird ein spezieller **Interaction Container** verwendet:

- **Konzept**: Die letzte User-Nachricht und die darauf folgende Antwort (oder Loading-Indicator) werden in einem speziellen Container gruppiert.
- **Verhalten**: 
  - Der Container hat eine Mindesthöhe (`min-h`), die fast den gesamten Screen füllt.
  - Mittels `flex-col` und `justify-start` werden die Nachrichten am **oberen Rand** fixiert.
  - Ein `flex-grow` Spacer am Ende des Containers drückt den leeren Raum nach unten.
  - Dies sorgt dafür, dass bei kurzen Nachrichten der Inhalt oben bleibt, während bei langen, streamenden Nachrichten der Container natürlich wächst.
- **Scroll-Logik**: Beim Senden einer neuen Nachricht wird der Container an den oberen Rand gescrollt, sodass die Frage des Nutzers fixiert erscheint, während die Antwort darunter "einfließt".

### Komponenten-Implementierung

- **ChatMessage**: Nutzt Tailwind-Klassen für Styling (kein manuelles CSS)
- **ChatInput**: DaisyUI-kompatible Input-Komponente
- **Header**: Flexbox-Layout mit Tailwind Utilities
- **SessionPicker**: Custom Dropdown mit Tailwind + DaisyUI

### Development-Workflow

1. **Design anpassen**: Ändere Werte in `tailwind.config.js` oder nutze DaisyUI-Komponenten
2. **Im Browser testen**: `npm run dev` im `frontend/` Ordner
3. **Build**: `npm run build` erstellt optimierte Dateien für Anki

## Zukünftige Design-Erweiterungen

- [ ] Light Theme Support (via DaisyUI Theme-Switching)
- [ ] Animierte Übergänge (Framer Motion Integration)
- [x] Custom Scrollbar-Styling (via Tailwind Utilities)
- [ ] Code-Syntax-Highlighting (für Code-Snippets)
- [ ] Markdown-Rendering in Nachrichten
- [ ] Emoji-Support verbessern
- [ ] Typing-Indicator
- [ ] Message-Timestamps
- [ ] Avatar-Icons für Bot/Benutzer

---

*Diese Design-Sprache wird kontinuierlich weiterentwickelt und verfeinert.*

