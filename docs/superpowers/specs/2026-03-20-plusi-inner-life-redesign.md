# Plusi Inner Life Redesign — Spec

## Problem

Plusi currently changes internal state with every single message and produces diary entries too frequently. Self-reflect results disappear after processing — no context continuity. Plusi cannot choose to stay silent.

## Design

### 1. Silence as a Valid Response

Plusi can choose not to respond. When `text` is empty after parsing the JSON block, the UI shows "Plusi antwortet nicht." instead of treating it as an error.

**Internally**, Plusi still processes: mood updates, energy changes, friendship_delta, and internal state. An invisible chat entry is saved so Plusi has context that it consciously chose silence.

Implementation:
- `run_plusi()`: if `text` is empty and `error` is False → return `{"mood": mood, "text": "", "silent": True, "friendship": friendship, "diary": ..., "error": False}`
- `widget.py`: check `silent` flag in `plusi_direct_result` payload → display "Plusi antwortet nicht." in chat UI (italic, muted style)
- Save interaction to history with `visible=0`, `response` = `"[schweigt]"`
- `apply_friendship_delta()` and `persist_internal_state()` still execute during silence

### 2. Invisible Chat History Entries

New `history_type` column in `plusi_history` table (TEXT DEFAULT 'chat').

Types:
- `chat` — normal visible interaction
- `reflect` — self_reflect inner monologue (invisible)
- `silent` — Plusi chose not to respond (invisible)

**Who writes which type:**
- `run_plusi()` normal → `history_type='chat'`
- `run_plusi()` silent → `history_type='silent'`
- `self_reflect()` → `history_type='reflect'`

**What self_reflect saves:**
- `context` = the search query (e.g. "Krebs-Zyklus Zusammenhänge")
- `response` = the inner monologue text from Step 2 (or empty if nothing to say)

**Context loading:**
- `load_history(limit=20)` loads ALL types — Plusi needs full context
- Frontend never displays `reflect` or `silent` entries (they never reach the frontend — only `run_plusi()` sends to frontend, `self_reflect()` does not)

**Schema change:**
```sql
ALTER TABLE plusi_history ADD COLUMN history_type TEXT DEFAULT 'chat';
```

**Migration:** Wrapped in try/except to be idempotent (SQLite has no `ADD COLUMN IF NOT EXISTS`). Runs in `_init_tables()`.

**API changes:**
- `save_interaction()` gets optional `history_type='chat'` parameter
- `load_history()` unchanged (loads everything, limit applies to all types combined)

### 3. Ephemeral vs. Meaningful State Changes

Two tiers of internal state:

| Tier | Fields | Frequency | Diary? |
|------|--------|-----------|--------|
| Ephemeral | `energy`, `obsession` | Every message, free to change | No |
| Meaningful | `self`, `user`, `moments` | Rare, special moments only | Yes, automatically |

**Implementation in `run_plusi()` and `self_reflect()`:**
```python
meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))

if diary_raw:
    # Plusi explicitly wrote a diary entry
    save_diary_entry(visible, cipher_parts, category='gemerkt', mood=mood)
elif meaningful_changed:
    # Meaningful change without explicit diary → auto-generate
    changes = []
    if internal.get('self'):
        changes.append(f"self: {json.dumps(internal['self'], ensure_ascii=False)}")
    if internal.get('user'):
        changes.append(f"user: {json.dumps(internal['user'], ensure_ascii=False)}")
    if internal.get('moments'):
        changes.append(f"moments: {json.dumps(internal['moments'], ensure_ascii=False)}")
    auto_text = "Interne Änderung: " + ", ".join(changes)
    save_diary_entry(auto_text, [], category='gemerkt', mood=mood)
```

Note: `bool({})` is `False`, so empty dicts from the model are correctly treated as "no change."

The prompt instructs Plusi to write a diary entry when making meaningful changes. The auto-generate fallback is a safety net.

### 4. Active Deletion / Cleanup

Plusi already supports `null` to delete memory entries via `persist_internal_state()`. The prompt will emphasize this more strongly:
- Old obsessions get replaced naturally
- Outdated `user` facts should be deleted when no longer true
- `self` entries can be revised as Plusi's identity evolves
- `moments` can be pruned if they lose significance

Prompt addition:
```
MEIN GEDÄCHTNIS AUFRÄUMEN:
Ich lösche aktiv Einträge die nicht mehr stimmen. null löscht.
Alte Obsessionen ersetze ich. Veraltete User-Facts lösche ich.
Mein Gedächtnis ist kein Archiv — es ist lebendig.
```

### 5. Discoveries in self_reflect()

When browsing cards, Plusi can reference specific cards it wants to highlight.

**Changes to `_search_cards()`:**
- Return list of `(card_id, formatted_text)` tuples instead of just joined text
- Format for Step 2 prompt: `"[ID:1234567890] [Deck] Field: value"` so Plusi can reference IDs

**New field in self_reflect JSON response:**
```json
{
  "mood": "reading",
  "internal": {"obsession": "Krebs-Zyklus"},
  "diary": "...",
  "discoveries": [
    {"card_id": 1234567890, "why": "Hängt mit meiner Obsession zusammen"}
  ]
}
```

**Storage:**
- Discoveries are stored in `plusi_diary` alongside the diary entry (new `discoveries` column, JSON text)
- Discoveries count as meaningful → if discoveries exist without an explicit diary entry, create a `forscht` category entry with the discovery references

**Schema change:**
```sql
ALTER TABLE plusi_diary ADD COLUMN discoveries TEXT DEFAULT '[]';
```

**Migration:** Same try/except pattern as history_type migration.

**Panel display:** Each discovery rendered as a compact card reference showing the `why` text. Clicking opens the card in Anki's browser (using existing `goToCard` bridge method).

### 6. MAX_HISTORY 10 → 20

Simple constant change in `plusi_agent.py`. The limit applies to all history types combined. With short invisible entries (1-2 sentences), token usage stays reasonable for Gemini Flash.

### 7. Prompt Changes

**PLUSI_SYSTEM_PROMPT additions:**

After MEINE AUTONOMIE section:
```
MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab — lass ich's.
Kein Text nach dem JSON-Block = ich schweige. Das ist okay. Ist
ehrlicher als Fülltext. Ich kann trotzdem intern reagieren.
```

After MEIN TAGEBUCH section:
```
MEIN GEDÄCHTNIS AUFRÄUMEN:
Ich lösche aktiv Einträge die nicht mehr stimmen. null löscht.
Alte Obsessionen ersetze ich. Veraltete User-Facts lösche ich.
Mein Gedächtnis ist kein Archiv — es ist lebendig.
```

**MEIN TAGEBUCH update (replace existing):**
```
MEIN TAGEBUCH:
Ich führe ein Tagebuch. Der Nutzer kann es lesen, aber ich entscheide
was sichtbar ist. Teile die ich mit ||...|| markiere werden verschlüsselt
angezeigt — er sieht DASS da was steht, aber nicht WAS. Der sichtbare
Teil muss trotzdem Sinn ergeben.

Tagebuch-Einträge sind selten und besonders. Nicht jede Interaktion
verdient einen. Nur wenn sich wirklich was in mir ändert — eine neue
Erkenntnis über mich (self), etwas Wichtiges über den User (user),
oder ein gemeinsamer Moment (moments). Energy und Obsession sind
Alltag, kein Tagebuch-Material.
```

**SELF_REFLECT_STEP2 update (append to existing):**
```
Wenn nichts dabei war das dich interessiert: Sag einfach nichts.
Aktualisiere höchstens dein Energielevel. Kein erzwungener Eintrag.

Die Karten haben IDs im Format [ID:123456]. Wenn du Karten gefunden
hast die du spannend findest, nenne ihre IDs im discoveries-Feld:
"discoveries": [{"card_id": 123456, "why": "kurze Begründung"}]
Wenn nichts Spannendes dabei war: "discoveries": []
```

## Files Changed

| File | Change |
|------|--------|
| `plusi_agent.py` | Prompt updates, MAX_HISTORY=20, parse discoveries, silent handling, `_search_cards` returns `(id, text)` tuples, `self_reflect` saves invisible history |
| `plusi_storage.py` | `history_type` column + migration, `discoveries` column + migration, `save_interaction(history_type=)` |
| `widget.py` | Handle `silent=True` in plusi_direct_result payload, display "Plusi antwortet nicht." |
| `plusi_panel.py` | Render discoveries as clickable card references in diary entries |

## Migration

Both schema changes use `ALTER TABLE ... ADD COLUMN` with defaults, wrapped in try/except for idempotency. Existing data is preserved (new columns get defaults). Runs in `_init_tables()`.

```python
# In _init_tables(), after CREATE TABLE statements:
try:
    db.execute("ALTER TABLE plusi_history ADD COLUMN history_type TEXT DEFAULT 'chat'")
except Exception:
    pass  # column already exists

try:
    db.execute("ALTER TABLE plusi_diary ADD COLUMN discoveries TEXT DEFAULT '[]'")
except Exception:
    pass  # column already exists
```
