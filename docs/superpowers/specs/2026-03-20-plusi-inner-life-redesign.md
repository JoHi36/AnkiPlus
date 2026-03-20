# Plusi Inner Life Redesign — Spec

## Problem

Plusi currently changes internal state with every single message and produces diary entries too frequently. Self-reflect results disappear after processing — no context continuity. Plusi cannot choose to stay silent.

## Design

### 1. Silence as a Valid Response

Plusi can choose not to respond. When `text` is empty after parsing the JSON block, the UI shows "Plusi antwortet nicht." instead of treating it as an error.

**Internally**, Plusi still processes: mood updates, energy changes, and an invisible chat entry is saved. This gives Plusi context that it consciously chose silence.

Implementation:
- `run_plusi()`: if `text` is empty and `error` is False → return `{"mood": mood, "text": "", "silent": True, ...}`
- `widget.py`: display "Plusi antwortet nicht." in the chat UI
- Save interaction to history with `visible=0`

### 2. Invisible Chat History Entries

New `visible` column in `plusi_history` table (INTEGER DEFAULT 1).

**Who writes invisible entries:**
- `self_reflect()` — inner monologue after browsing cards
- `run_plusi()` when Plusi chooses silence

**Context loading:**
- `load_history()` loads ALL entries (visible + invisible) — Plusi needs full context
- Frontend only displays `visible=1` entries

**Schema change:**
```sql
ALTER TABLE plusi_history ADD COLUMN visible INTEGER DEFAULT 1;
```

**API changes:**
- `save_interaction()` gets optional `visible=True` parameter
- `load_history()` unchanged (loads everything)

### 3. Ephemeral vs. Meaningful State Changes

Two tiers of internal state:

| Tier | Fields | Frequency | Diary? |
|------|--------|-----------|--------|
| Ephemeral | `energy`, `obsession` | Every message, free to change | No |
| Meaningful | `self`, `user`, `moments` | Rare, special moments only | Yes, automatically |

**Implementation in `run_plusi()` and `self_reflect()`:**
```python
meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))
if meaningful_changed and diary_raw:
    save_diary_entry(visible, cipher_parts, category='gemerkt', mood=mood)
elif meaningful_changed and not diary_raw:
    # Auto-generate diary from the meaningful changes
    save_diary_entry(auto_diary_text, [], category='gemerkt', mood=mood)
```

The prompt instructs Plusi to write a diary entry when making meaningful changes. As a fallback, the code auto-generates one if Plusi forgets.

### 4. Active Deletion / Cleanup

Plusi already supports `null` to delete memory entries. The prompt will emphasize this more strongly:
- Old obsessions get replaced naturally
- Outdated `user` facts should be deleted when no longer true
- `self` entries can be revised as Plusi's identity evolves
- `moments` can be pruned if they lose significance

Prompt addition to MEINE AUTONOMIE section:
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
- Pass card IDs to Plusi in the Step 2 prompt so it can reference them

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
- If no diary entry but discoveries exist → create a minimal `forscht` category entry

**Schema change:**
```sql
ALTER TABLE plusi_diary ADD COLUMN discoveries TEXT DEFAULT '[]';
```

### 6. MAX_HISTORY 10 → 20

Simple constant change in `plusi_agent.py`. With invisible entries included, this gives Plusi better continuity across sessions.

### 7. Prompt Changes

**PLUSI_SYSTEM_PROMPT additions:**

```
MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab — lass ich's.
Kein Text nach dem JSON-Block = ich schweige. Das ist okay. Ist
ehrlicher als Fülltext. Ich kann trotzdem intern reagieren.

MEIN GEDÄCHTNIS AUFRÄUMEN:
Ich lösche aktiv Einträge die nicht mehr stimmen. null löscht.
Alte Obsessionen ersetze ich. Veraltete User-Facts lösche ich.
Mein Gedächtnis ist kein Archiv — es ist lebendig.
```

**MEIN TAGEBUCH update:**
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

**SELF_REFLECT_STEP2 update:**
```
Wenn nichts dabei war das dich interessiert: Sag einfach nichts.
Aktualisiere höchstens dein Energielevel. Kein erzwungener Eintrag.
Wenn du Karten gefunden hast die du spannend findest, nenne ihre IDs
im discoveries-Feld.
```

## Files Changed

| File | Change |
|------|--------|
| `plusi_agent.py` | Prompt updates, MAX_HISTORY, parse discoveries, silent handling, _search_cards returns IDs |
| `plusi_storage.py` | `visible` column, `discoveries` column, `save_interaction(visible=)`, schema migration |
| `widget.py` | Handle `silent=True` response, display "Plusi antwortet nicht." |
| `plusi_panel.py` | Display discoveries in diary entries (if applicable) |

## Migration

Both schema changes use `ALTER TABLE ... ADD COLUMN` with defaults, so existing data is preserved. Run on first access via `_get_db()` initialization.
