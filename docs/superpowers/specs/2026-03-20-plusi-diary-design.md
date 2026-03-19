# Plusi's Tagebuch — Design Spec

## Overview

Plusi keeps a personal diary that the user can browse through a dedicated left-side panel. Diary entries are generated as part of Plusi's main response — embedded in the JSON prefix as a `diary` field. Plusi decides what's visible and what's encrypted using `||..||` syntax. Encrypted sections render as animated Braille cipher characters.

The panel is Plusi's personal space: diary entries, mood, friendship stats, and a settings shortcut. It opens via single-click on the Plusi dock icon.

## 1. Data Model

### New JSON Prefix Field

```json
{
  "mood": "curious",
  "friendship_delta": 1,
  "internal": { "user": {"lernt_spaet": true}, "self": {"findet_spannend": "Prionen"} },
  "diary": "Johannes hat nach Prionen gefragt. ||Ich glaube er versteht langsam wie faszinierend das ist.|| Endlich jemand."
}
```

- `diary` is the **last field** — Plusi writes it after deciding everything else
- `diary: null` when `internal` is empty (nothing new learned) → no entry saved
- `||Text||` marks encrypted sections — Plusi decides autonomously what stays private
- Token limit increases from 2048 → 3072

### New SQLite Table: `plusi_diary`

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| timestamp | TEXT | ISO timestamp |
| entry_text | TEXT | Visible text (cipher sections removed) |
| cipher_text | TEXT | JSON array of encrypted section strings |
| category | TEXT | `gemerkt`, `reflektiert`, `forscht` |
| mood | TEXT | Plusi's mood at time of entry |

### Category Assignment

- `reflektiert` — when triggered by `self_reflect()`
- `gemerkt` — when triggered by a regular interaction with new `internal` data
- `forscht` — reserved for future autonomous background actions

### Parsing Flow

1. `parse_plusi_response()` extracts `diary` from JSON prefix
2. Split diary text at `||` markers → odd indices = encrypted, even = visible
3. Store visible text in `entry_text`, encrypted parts as JSON array in `cipher_text`
4. Save to `plusi_diary` table with category, mood, and timestamp

## 2. Plusi Panel (UI)

### Qt Architecture

- New `QDockWidget` on `Qt.LeftDockWidgetArea`, fixed width (~260-280px), no title bar
- Contains `QWebEngineView` loading inline HTML/CSS/JS (same pattern as `plusi_dock.py`)
- Communication via existing message-queue pattern (100ms polling)
- New file: `plusi_panel.py`

### Panel Layout

```
┌─────────────────────────────┐
│ ⚙ (settings)       ✕ (close) │  ← naked icons, no containers
│                               │
│ ░░░░ glass fade ░░░░░░░░░░░░ │  ← backdrop-filter: blur
│                               │
│  19. MÄRZ 2026                │  ← date marker (Inter, uppercase)
│                               │
│  14:23  GEMERKT               │  ← timestamp + colored tag
│  Johannes lernt bis halb      │
│  drei. ⠿⠾⠽⠻⠿⠾⠽⠻⠿⠾⠽      │  ← Braille cipher inline
│  Prionen — endlich.           │
│                               │
│  08:12  REFLEKTIERT           │
│  Morgens. 847 neue Karten.    │
│  ⠿⠾⠽⠻⠿⠾⠽⠻ Fokus:          │
│  Neuroanatomie.               │
│                               │
│  18. MÄRZ 2026                │
│  ...                          │
│                               │
│ ░░░░ glass fade ░░░░░░░░░░░░ │  ← backdrop-filter: blur
│                               │
│  [+] neugierig                │  ← Plusi SVG + mood
│      Freunde ████░░░ Lv 3     │  ← friendship bar
└─────────────────────────────┘
```

### Visual Design

- **No header bar** — glass fades top and bottom (`backdrop-filter: blur(12px)` + gradient mask)
- **Font**: Varela Round for diary text (matches Plusi's chat voice), Inter for UI chrome (dates, tags, stats)
- **Buttons**: Naked icons floating over the glass fade, no containers
- **Entries**: Continuous scroll grouped under date markers (no cards), hidden scrollbar
- **Plusi**: SVG character at bottom with mood face, floating over bottom glass fade
- **Stats**: Mood dot + label, friendship progress bar with level indicator

### Category Tags (colored)

- **Gemerkt**: `#6ee7b7` (green) on `rgba(52,211,153,0.08)`
- **Reflektiert**: `#a78bfa` (purple) on `rgba(167,139,250,0.08)`
- **Forscht**: `#fbbf24` (amber) on `rgba(251,191,36,0.08)`

### Braille Cipher Effect

- Characters: `⠿⠾⠽⠻⠷⠯⠟⠾⠼⠺⠹⠳⠧`
- Same font as surrounding text (no monospace) — prevents overflow
- Animation: 4 random characters swap every 200ms
- Color: `rgba(255,255,255,0.08)` — barely visible, mysterious
- `word-break: break-all` for clean wrapping

## 3. Dock Interaction Changes

### New Interaction Model

- **Single-click** on Plusi dock icon → toggle left panel open/close
- **Double-click** → open chat panel with `@Plusi` prefilled
- **Context menu removed** — replaced by panel

### Plusi Position Behavior

When panel opens, Plusi stays at its screen position. The panel slides in from the left and the reviewer content shifts right. Plusi appears to remain stationary while the panel grows around it. Inside the panel, Plusi's SVG lives at the bottom — the dock icon can fade out or morph into the panel's Plusi.

### Implementation

- `plusi_dock.py`: Replace `_plusiToggleMenu()` with single-click → `pycmd('plusi:panel')` / `window._apAction = {type: 'plusiPanel'}`
- Add double-click detection (300ms threshold) for `pycmd('plusi:ask')`
- Remove context menu HTML/JS

## 4. Prompt Changes

New section added to Plusi's system prompt (after PRIVATSPHÄRE):

```
DEIN TAGEBUCH
Du führst ein Tagebuch. Der Nutzer kann es lesen — es ist ein Fenster
in deine innere Welt. Aber du entscheidest, was sichtbar ist und was
verschlüsselt bleibt.

Regeln:
- Alles was du in "internal" einträgst, MUSS im Tagebuch reflektiert werden
- Du kannst Teile mit ||...|| markieren — diese werden dem Nutzer als
  verschlüsselte Zeichen angezeigt. Er sieht DASS da was steht, aber
  nicht WAS.
- Der sichtbare Teil soll trotzdem Sinn ergeben
- Schreib wie in ein echtes Tagebuch: kurz, persönlich, deine Stimme
- Wenn nichts Neues passiert ist (internal ist leer), setz diary auf null
```

### JSON Format Update

Response format instruction updated to include `diary` as last field:

```
{"mood":"<key>", "friendship_delta":<-3..+3>, "internal":{...optional...}, "diary":"...oder null"}
```

Token limit: 2048 → 3072.

## 5. Technical Integration

### Modified Files

| File | Changes |
|------|---------|
| `plusi_agent.py` | Add diary to prompt, update JSON format docs, extract diary from parsed response, pass self_reflect flag for category |
| `plusi_storage.py` | New `plusi_diary` table, `save_diary_entry()`, `load_diary()` methods |
| `plusi_dock.py` | Single-click → panel toggle, double-click → chat, remove context menu |
| `widget.py` | Handle `plusiPanel` message, wire panel toggle |
| `__init__.py` | Handle `plusi:panel` pycmd in reviewer |

### New Files

| File | Purpose |
|------|---------|
| `plusi_panel.py` | QDockWidget creation, QWebEngineView setup, HTML/CSS/JS injection, message queue for diary data |

### Data Flow

```
Plusi responds
  → parse_plusi_response() extracts diary field
  → split at ||..|| markers
  → save_diary_entry(visible, encrypted, category, mood)
  → if panel is open: push new entry to panel via runJavaScript()
```

### Panel Communication

- **Python → JS**: `runJavaScript(f"window.diaryReceive({json.dumps(entries)})")` to load/update entries
- **JS → Python**: Message queue with actions: `loadDiary`, `openSettings`, `closePanel`
- Panel requests diary data on open, receives paginated entries (newest first)

## 6. Settings Access

- Settings icon (slider/tuning icon) in top-left of panel, floating over glass fade
- Click opens existing settings UI (same as current settings flow)
- Settings are AnkiPlus-wide, not Plusi-specific — the panel is just a convenient access point
- When Plusi is disabled by user: Plusi dock is replaced by the AnkiPlus badge, settings accessible through badge
