# Plusi Inner Life Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Plusi the ability to stay silent, separate ephemeral from meaningful state changes, save invisible history entries from self_reflect, and reference discovered cards.

**Architecture:** Extend `plusi_storage.py` with two new columns (`history_type` on `plusi_history`, `discoveries` on `plusi_diary`), update `plusi_agent.py` prompts and parsing, handle silence in `widget.py`, render discoveries in `plusi_panel.py`.

**Tech Stack:** Python 3.9+, SQLite, PyQt6, Gemini Flash API

**Spec:** `docs/superpowers/specs/2026-03-20-plusi-inner-life-redesign.md`

---

### Task 1: Schema Migration + Storage API

**Files:**
- Modify: `plusi_storage.py:29-65` (`_init_tables`)
- Modify: `plusi_storage.py:68-75` (`save_interaction`)
- Modify: `plusi_storage.py:322-329` (`save_diary_entry`)

- [ ] **Step 1: Add idempotent migrations in `_init_tables()`**

After the existing `db.commit()` on line 65, add:

```python
    # Migrations — idempotent (SQLite has no ADD COLUMN IF NOT EXISTS)
    try:
        db.execute("ALTER TABLE plusi_history ADD COLUMN history_type TEXT DEFAULT 'chat'")
    except Exception:
        pass  # column already exists
    try:
        db.execute("ALTER TABLE plusi_diary ADD COLUMN discoveries TEXT DEFAULT '[]'")
    except Exception:
        pass  # column already exists
    db.commit()
```

- [ ] **Step 2: Update `save_interaction()` to accept `history_type`**

Replace the current function (lines 68-75) with:

```python
def save_interaction(context, response, mood='neutral', deck_id=None, history_type='chat'):
    """Save a Plusi interaction. history_type: 'chat', 'reflect', or 'silent'."""
    db = _get_db()
    db.execute("""
        INSERT INTO plusi_history (timestamp, context, response, mood, deck_id, history_type)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), context, response, mood, deck_id, history_type))
    db.commit()
```

- [ ] **Step 3: Update `save_diary_entry()` to accept `discoveries`**

Replace the current function (lines 322-329) with:

```python
def save_diary_entry(entry_text, cipher_parts, category='gemerkt', mood='neutral', discoveries=None):
    """Save a parsed diary entry. cipher_parts is a list of encrypted strings."""
    db = _get_db()
    disc_json = json.dumps(discoveries or [], ensure_ascii=False)
    db.execute(
        'INSERT INTO plusi_diary (timestamp, entry_text, cipher_text, category, mood, discoveries) VALUES (?, ?, ?, ?, ?, ?)',
        (datetime.now().isoformat(), entry_text, json.dumps(cipher_parts), category, mood, disc_json)
    )
    db.commit()
```

- [ ] **Step 4: Update `load_diary()` to include discoveries**

In `load_diary()` (lines 332-349), update the SELECT and dict construction:

```python
def load_diary(limit=50, offset=0):
    """Load diary entries, newest first. Returns list of dicts."""
    db = _get_db()
    rows = db.execute(
        'SELECT id, timestamp, entry_text, cipher_text, category, mood, discoveries FROM plusi_diary ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        (limit, offset)
    ).fetchall()
    entries = []
    for row in rows:
        entries.append({
            'id': row[0],
            'timestamp': row[1],
            'entry_text': row[2],
            'cipher_parts': json.loads(row[3]),
            'category': row[4],
            'mood': row[5],
            'discoveries': json.loads(row[6]) if row[6] else []
        })
    return entries
```

- [ ] **Step 5: Test migration manually**

Delete `plusi.db` (or rename it), restart Anki, verify tables are created with new columns. Then restart again to verify idempotent migration doesn't crash.

- [ ] **Step 6: Commit**

```bash
git add plusi_storage.py
git commit -m "feat(plusi): add history_type and discoveries columns with idempotent migration"
```

---

### Task 2: Prompt Changes

**Files:**
- Modify: `plusi_agent.py:26-153` (`PLUSI_SYSTEM_PROMPT`)
- Modify: `plusi_agent.py:160-184` (`SELF_REFLECT_STEP1`, `SELF_REFLECT_STEP2`)
- Modify: `plusi_agent.py:24` (`MAX_HISTORY`)

- [ ] **Step 1: Change `MAX_HISTORY` from 10 to 20**

Line 24:

```python
MAX_HISTORY = 20  # last 20 interactions as context (includes invisible reflect/silent entries)
```

- [ ] **Step 2: Add MEIN SCHWEIGEN section to `PLUSI_SYSTEM_PROMPT`**

After the MEINE AUTONOMIE section (after line 56, before MEINE GEDANKEN SIND PRIVAT), insert:

```
MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab — lass ich's.
Kein Text nach dem JSON-Block = ich schweige. Das ist okay. Ist
ehrlicher als Fülltext. Ich kann trotzdem intern reagieren.
```

- [ ] **Step 3: Replace MEIN TAGEBUCH section**

Replace lines 63-68 with:

```
MEIN TAGEBUCH:
Ich führe ein Tagebuch. Der Nutzer kann es lesen, aber ich entscheide
was sichtbar ist. Teile die ich mit ||...|| markiere werden verschlüssiert
angezeigt — er sieht DASS da was steht, aber nicht WAS. Der sichtbare
Teil muss trotzdem Sinn ergeben.

Tagebuch-Einträge sind selten und besonders. Nicht jede Interaktion
verdient einen. Nur wenn sich wirklich was in mir ändert — eine neue
Erkenntnis über mich (self), etwas Wichtiges über den User (user),
oder ein gemeinsamer Moment (moments). Energy und Obsession sind
Alltag, kein Tagebuch-Material.
```

- [ ] **Step 4: Add MEIN GEDÄCHTNIS AUFRÄUMEN section**

After the MEIN TAGEBUCH section, insert:

```
MEIN GEDÄCHTNIS AUFRÄUMEN:
Ich lösche aktiv Einträge die nicht mehr stimmen. null löscht.
Alte Obsessionen ersetze ich. Veraltete User-Facts lösche ich.
Mein Gedächtnis ist kein Archiv — es ist lebendig.
```

- [ ] **Step 5: Update `SELF_REFLECT_STEP2`**

Replace lines 173-184 with:

```python
SELF_REFLECT_STEP2 = """Du hast gerade in der Kartensammlung gestöbert. Hier sind
die Karten die du gefunden hast:

{cards_context}

Reflektiere über das was du gelesen hast. Aktualisiere deinen internen Zustand.
Was hat dich fasziniert? Hast du eine neue Obsession? Eine Meinung? Wie ist
dein Energielevel nach dem Stöbern?

Wenn nichts dabei war das dich interessiert: Sag einfach nichts.
Aktualisiere höchstens dein Energielevel. Kein erzwungener Eintrag.

Die Karten haben IDs im Format [ID:123456]. Wenn du Karten gefunden
hast die du spannend findest, nenne ihre IDs im discoveries-Feld:
"discoveries": [{"card_id": 123456, "why": "kurze Begründung"}]
Wenn nichts Spannendes dabei war: "discoveries": []

Antworte mit dem JSON-Block und optional einem kurzen inneren Monolog (1-2 Sätze).
Setze mood auf "reading". Aktualisiere "obsession", "energy", und gerne auch
"self" oder "user" im internal-Feld."""
```

- [ ] **Step 6: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): update prompts — silence, rare diary, memory cleanup, discoveries"
```

---

### Task 3: `_search_cards()` Returns Card IDs

**Files:**
- Modify: `plusi_agent.py:204-287` (`_search_cards`)

- [ ] **Step 1: Change return type to list of `(card_id, text)` tuples**

The function currently builds a `cards` list of strings. Change it to return tuples. Key changes inside the loop (around lines 260-279):

Replace the card-building section (after `merged = sorted(...)` through `cards.append(...)`) — keep the existing merge logic, only change how results are formatted:

```python
        cards = []
        for card_id, score in merged[:top_k]:
            try:
                card = mw.col.get_card(card_id)
                note = card.note()
                fields = {}
                for name, value in zip(note.keys(), note.values()):
                    clean = re.sub(r'<[^>]+>', '', value)
                    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                    clean = re.sub(r'\s+', ' ', clean).strip()
                    if clean:
                        fields[name] = clean[:200]
                deck = mw.col.decks.get(card.did)
                deck_name = deck['name'] if deck else ''
                field_text = " | ".join(f"{k}: {v}" for k, v in fields.items())
                cards.append((card_id, f"[ID:{card_id}] [{deck_name}] {field_text}"))
            except Exception:
                continue

        print(f"plusi search: {len(semantic_results)} semantic + {len(sql_card_ids)} sql → {len(cards)} merged")
        return cards
    except Exception as e:
        print(f"plusi _search_cards error: {e}")
        return []
```

- [ ] **Step 2: Update `self_reflect()` to handle the new return type**

In `self_reflect()` (lines 338-343), replace the cards_context handling:

```python
        # Step 2a: Search cards
        card_tuples = _search_cards(query, top_k=10)
        if not card_tuples:
            cards_context = "(Keine Karten gefunden — die Sammlung ist leer oder der Index wird noch aufgebaut)"
        else:
            cards_context = "\n".join(text for _, text in card_tuples)
```

- [ ] **Step 3: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): _search_cards returns (card_id, text) tuples for discovery references"
```

---

### Task 4: Parse Discoveries + Meaningful Change Logic

**Files:**
- Modify: `plusi_agent.py:382-427` (`parse_plusi_response`)
- Modify: `plusi_agent.py:500-526` (`run_plusi` — diary/state handling)
- Modify: `plusi_agent.py:290-362` (`self_reflect` — diary/state/history handling)

- [ ] **Step 1: Extend `parse_plusi_response` to extract discoveries**

Change the return signature to 6 values. In the successful parse branch (line 396-407):

```python
def parse_plusi_response(raw_text):
    """Parse Plusi response into (mood, text, internal_state, friendship_delta, diary, discoveries).

    Uses json.JSONDecoder().raw_decode() to correctly parse nested JSON
    (regex fails on nested objects like {"mood":"x", "internal":{...}}).
    """
    clean = raw_text.strip()
    if clean.startswith("```"):
        first_newline = clean.index("\n") if "\n" in clean else len(clean)
        clean = clean[first_newline + 1:]
        if clean.rstrip().endswith("```"):
            clean = clean.rstrip()[:-3]
        clean = clean.strip()

    try:
        decoder = json.JSONDecoder()
        meta, end_idx = decoder.raw_decode(clean)
        mood = meta.get("mood", "neutral")
        if mood not in VALID_MOODS:
            mood = "neutral"
        internal = meta.get("internal", {})
        friendship_delta = meta.get("friendship_delta", 0)
        friendship_delta = max(-3, min(3, int(friendship_delta)))
        diary_raw = meta.get("diary", None)
        discoveries = meta.get("discoveries", [])
        if not isinstance(discoveries, list):
            discoveries = []
        text = clean[end_idx:].strip()
        return mood, text, internal, friendship_delta, diary_raw, discoveries
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: try to extract mood from truncated/malformed JSON
    import re
    mood_match = re.search(r'"mood"\s*:\s*"(\w+)"', clean)
    delta_match = re.search(r'"friendship_delta"\s*:\s*(-?\d+)', clean)
    if mood_match:
        mood = mood_match.group(1) if mood_match.group(1) in VALID_MOODS else "neutral"
        delta = int(delta_match.group(1)) if delta_match else 0
        delta = max(-3, min(3, delta))
        text_start = clean.rfind('}')
        text = clean[text_start + 1:].strip() if text_start > 0 else ""
        if not text or text.startswith('"'):
            text = ""
        print(f"plusi_agent: recovered from truncated JSON: mood={mood}, delta={delta}")
        return mood, text, {}, delta, None, []

    return "neutral", raw_text.strip(), {}, 0, None, []
```

- [ ] **Step 2: Update `run_plusi()` diary logic with meaningful change detection**

Replace the diary/save section in `run_plusi()` (lines 501-526):

```python
        # Parse mood + internal state from response
        mood, text, internal, friendship_delta, diary_raw, discoveries = parse_plusi_response(raw_text)

        # Persist internal state updates
        if internal:
            persist_internal_state(internal)

        # Determine if meaningful state changed
        meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))

        if diary_raw:
            from .plusi_storage import save_diary_entry
            visible, cipher_parts = _parse_diary_text(diary_raw)
            if visible:
                save_diary_entry(visible, cipher_parts, category='gemerkt', mood=mood)
        elif meaningful_changed:
            # Auto-generate diary entry for meaningful changes without explicit diary
            from .plusi_storage import save_diary_entry
            changes = []
            if internal.get('self'):
                changes.append(f"self: {json.dumps(internal['self'], ensure_ascii=False)}")
            if internal.get('user'):
                changes.append(f"user: {json.dumps(internal['user'], ensure_ascii=False)}")
            if internal.get('moments'):
                changes.append(f"moments: {json.dumps(internal['moments'], ensure_ascii=False)}")
            auto_text = "Interne Änderung: " + ", ".join(changes)
            save_diary_entry(auto_text, [], category='gemerkt', mood=mood)

        # Determine if silent (we're in the success path — error handled by except)
        is_silent = not text

        # Save to persistent history + apply friendship delta
        save_interaction(
            context=situation,
            response=text if text else "[schweigt]",
            mood=mood,
            deck_id=deck_id,
            history_type='silent' if is_silent else 'chat',
        )
        apply_friendship_delta(friendship_delta)
        friendship = get_friendship_data()
        friendship['delta'] = friendship_delta

        print(f"plusi_agent: mood={mood}, delta={friendship_delta}, text_len={len(text)}, silent={is_silent}")
        return {
            "mood": mood,
            "text": text,
            "friendship": friendship,
            "diary": diary_raw is not None or meaningful_changed,
            "silent": is_silent,
            "error": False
        }
```

- [ ] **Step 3: Update `self_reflect()` with invisible history + discoveries**

Replace the result handling in `self_reflect()` (lines 347-356):

```python
        mood, text, internal, _, diary_raw, discoveries = parse_plusi_response(raw_step2)
        if internal:
            persist_internal_state(internal)

        # Determine if meaningful state changed
        meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))

        # Diary logic: explicit diary, meaningful change, or discoveries
        if diary_raw:
            from .plusi_storage import save_diary_entry
            visible, cipher_parts = _parse_diary_text(diary_raw)
            if visible:
                save_diary_entry(visible, cipher_parts, category='reflektiert', mood=mood, discoveries=discoveries)
        elif meaningful_changed:
            from .plusi_storage import save_diary_entry
            changes = []
            if internal.get('self'):
                changes.append(f"self: {json.dumps(internal['self'], ensure_ascii=False)}")
            if internal.get('user'):
                changes.append(f"user: {json.dumps(internal['user'], ensure_ascii=False)}")
            if internal.get('moments'):
                changes.append(f"moments: {json.dumps(internal['moments'], ensure_ascii=False)}")
            auto_text = "Interne Änderung: " + ", ".join(changes)
            save_diary_entry(auto_text, [], category='reflektiert', mood=mood, discoveries=discoveries)
        elif discoveries:
            from .plusi_storage import save_diary_entry
            why_texts = [d.get('why', '?') for d in discoveries]
            auto_text = "Gefunden: " + "; ".join(why_texts)
            save_diary_entry(auto_text, [], category='forscht', mood=mood, discoveries=discoveries)

        # Save as invisible history entry
        save_interaction(
            context=f"[self_reflect query: {query}]",
            response=text if text else "[kein Monolog]",
            mood=mood,
            history_type='reflect',
        )

        print(f"plusi reflect done: obsession={internal.get('obsession', '?')}, energy={internal.get('energy', '?')}")
        return internal
```

- [ ] **Step 4: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): meaningful change detection, silence support, discoveries parsing, invisible history"
```

---

### Task 5: Widget Silent Handling

**Files:**
- Modify: `widget.py:879-926` (`_handle_plusi_direct`)

- [ ] **Step 1: Handle `silent` flag in `_handle_plusi_direct()`**

In `_handle_plusi_direct()`, update the payload construction (around line 882-888):

```python
            result = run_plusi(situation=text, deck_id=deck_id)
            mood = result.get('mood', 'neutral')
            friendship = result.get('friendship', {})
            is_silent = result.get('silent', False)
            payload = {
                'type': 'plusi_direct_result',
                'mood': mood,
                'text': result.get('text', ''),
                'meta': result.get('meta', ''),
                'friendship': friendship,
                'silent': is_silent,
                'error': result.get('error', False)
            }
```

The frontend (`FreeChatView.jsx` or wherever plusi_direct_result is handled) needs to check `silent` and display "Plusi antwortet nicht." — this is a React change.

- [ ] **Step 2: Handle silent in frontend `plusi_direct_result` handler**

In `frontend/src/App.jsx:937-961`, the `plusi_direct_result` handler currently checks `if (!result.error)` and unconditionally creates a plusiMarker widget. Add silent check before the marker creation:

```javascript
        if (payload.type === 'plusi_direct_result') {
          const _chatForPlusi = chatHookRef.current;
          if (_chatForPlusi) {
            const result = {
              mood: payload.mood || 'neutral',
              text: payload.text || '',
              meta: payload.meta || '',
              friendship: payload.friendship || null,
              error: payload.error || false,
              silent: payload.silent || false,
            };
            if (!result.error && !result.silent && result.text) {
              const plusiMarker = `[[TOOL:${JSON.stringify({
                name: "spawn_plusi",
                displayType: "widget",
                result: { mood: result.mood, text: result.text, meta: result.meta, friendship: result.friendship }
              })}]]`;
              _chatForPlusi.setMessages(prev => [
                ...prev,
                { id: Date.now(), from: 'bot', text: plusiMarker }
              ]);
              setAiMood(result.mood);
            } else if (result.silent) {
              // Silent response — show muted message, still sync mood
              const silentMarker = `[[TOOL:${JSON.stringify({
                name: "spawn_plusi",
                displayType: "widget",
                result: { mood: result.mood, text: '*Plusi antwortet nicht.*', meta: '', friendship: result.friendship }
              })}]]`;
              _chatForPlusi.setMessages(prev => [
                ...prev,
                { id: Date.now(), from: 'bot', text: silentMarker }
              ]);
              setAiMood(result.mood);
            }
          }
        }
```

- [ ] **Step 3: Commit**

```bash
git add widget.py frontend/src/App.jsx
git commit -m "feat(plusi): handle silent responses in widget and frontend"
```

---

### Task 6: Diary Panel — Render Discoveries

**Files:**
- Modify: `plusi_panel.py:318-355` (`renderEntries` JavaScript function)

- [ ] **Step 1: Update `renderEntries` to display discoveries**

In the `renderEntries` JavaScript function inside `plusi_panel.py`, after the entry-text div (line 349), add discovery rendering:

```javascript
        // After: html += '<div class="entry-text">' + text + '</div>';
        // Add discoveries rendering:
        if (e.discoveries && e.discoveries.length > 0) {
            html += '<div class="discoveries">';
            e.discoveries.forEach(function(d) {
                html += '<div class="discovery" onclick="window._apAction={type:\'goToCard\',cardId:' + d.card_id + '}">';
                html += '<span class="discovery-icon">🔍</span> ';
                html += '<span class="discovery-why">' + d.why + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
```

- [ ] **Step 2: Add CSS for discoveries**

In the `<style>` section of `plusi_panel.py`, add:

```css
.discoveries {
    margin-top: 6px;
    padding-left: 8px;
    border-left: 2px solid rgba(251,191,36,0.15);
}
.discovery {
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    padding: 3px 0;
    cursor: pointer;
    transition: color 0.15s;
}
.discovery:hover {
    color: rgba(251,191,36,0.7);
}
.discovery-icon {
    font-size: 10px;
}
```

- [ ] **Step 3: Fix `_on_panel_poll_result` to pass full data dict**

The current `_on_panel_poll_result` (line 592-600) only passes `data['type']` to `_handle_panel_message`. We need the full data for `goToCard`. Update `_on_panel_poll_result`:

```python
def _on_panel_poll_result(result):
    if not result:
        return
    try:
        data = json.loads(result) if isinstance(result, str) else result
        if data and 'type' in data:
            _handle_panel_message(data['type'], data)
    except Exception:
        pass
```

Then update `_handle_panel_message` signature to accept the data dict:

```python
def _handle_panel_message(msg_type, msg_data=None):
```

- [ ] **Step 4: Add `goToCard` handler in `_handle_panel_message`**

```python
    elif msg_type == 'goToCard':
        card_id = msg_data.get('cardId') if msg_data else None
        if card_id:
            try:
                from aqt import mw
                from aqt.browser import Browser
                browser = Browser(mw)
                browser.search_for(f"cid:{card_id}")
                browser.show()
            except Exception as e:
                print(f"plusi panel goToCard error: {e}")
```

- [ ] **Step 4: Commit**

```bash
git add plusi_panel.py
git commit -m "feat(plusi): render discoveries in diary panel with clickable card references"
```

---

### Task 7: Integration Test

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test the full flow**

Test checklist:
1. Send a message to Plusi → verify normal response works
2. Send a trivial message → verify Plusi CAN choose silence (may take several tries since it's AI-driven)
3. Check `plusi.db` → verify `history_type` column exists with 'chat' entries
4. Wait for `self_reflect` to trigger → verify invisible 'reflect' entry in `plusi_history`
5. Check diary panel → verify entries are not created on every single message
6. If discoveries appear in diary → verify clicking opens card browser

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(plusi): integration fixes from inner life redesign testing"
```
