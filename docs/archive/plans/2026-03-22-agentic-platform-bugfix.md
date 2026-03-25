# Agentic Platform — Bugfix & Integration Prompt

**Paste diesen Prompt in eine neue Claude Code Session:**

---

## Start-Prompt

Lies die Spec `docs/superpowers/specs/2026-03-22-agentic-platform-architecture.md` und die Memory-Datei `project_agentic_ui_bugs.md`. Dann fixe die folgenden 12 Bugs in dieser Reihenfolge. Baue nach den kritischen Fixes das Frontend neu (`cd frontend && npm run build`) und teste.

### KRITISCH (App ist buggy)

**Bug 1 — Dual Routing: rag_router macht noch Subagent-Delegation**
- `ai/rag.py`: Entferne ALLES was mit `subagent:` zu tun hat:
  - Zeilen ~216-227: `get_router_subagent_prompt()` Import und Injection in den Router-Prompt entfernen
  - Zeile ~324 im Prompt-String: Die `subagent:` Option aus dem DECISION TREE entfernen
  - Zeilen ~392-406, ~421, ~559-565, ~710: Alle `retrieval_mode.startswith('subagent:')` Validierung und Emission entfernen
  - `rag_router()` darf NUR noch `retrieval_mode` ∈ {`sql`, `semantic`, `both`} returnen, NIEMALS `subagent:*`
- Der neue Router in `ai/router.py` handelt Agent-Dispatch bereits in Stage 0 von `handler.py`

**Bug 2 — Fehlender "Orchestrating" Step für Tutor**
- `ai/handler.py` Stage 0 Block (~Zeile 374): Wenn `routing_result.agent == 'tutor'`, wird kein `orchestrating` Pipeline-Step emittiert
- Fix: NACH dem `route_message()` Call und VOR `# Stage 1: Router`, emitte:
  ```python
  self._emit_pipeline_step("orchestrating", "done", {
      'agent': 'tutor',
      'method': routing_result.method,
      'search_needed': True,
  })
  ```

**Bug 3 — @Help routet zu Plusi**
- `ui/widget.py` Zeilen ~1161-1177: `_handle_subagent_direct()` importiert aus `ai.subagents` und nutzt `SUBAGENT_REGISTRY`
- Das ist jetzt ein Wrapper auf `AGENT_REGISTRY` — sollte funktionieren, aber debugge:
  1. Kommt `subagentDirect('help', ...)` im Python an?
  2. Findet `SUBAGENT_REGISTRY.get('help')` den Help-Agent?
  3. Ist `config.get('help_enabled', False)` = True?
  4. Lädt `lazy_load_run_fn(help_def)` korrekt `run_help`?
  5. Falls alles OK: Prüfe SubagentThread ob der richtige Agent aufgerufen wird

### WICHTIG (UX-Probleme)

**Bug 4 — ThoughtStream außerhalb AgenticCell**
- `frontend/src/components/ChatMessage.jsx`: ThoughtStream rendert bei ~Zeile 1749 (VOR dem AgenticCell), AgenticCell bei ~Zeile 1823
- Fix: ThoughtStream INNERHALB des AgenticCell für Bot-Nachrichten verschieben:
  ```jsx
  <AgenticCell agentName="tutor">
    {shouldRenderThoughtStream && <ThoughtStream ... />}
    <SafeMarkdownRenderer ... />
  </AgenticCell>
  ```

**Bug 5 — @Tutor fehlt im @-Mention Dropdown**
- `shared/config/agentRegistry.js`: `getDirectCallPattern()` schließt eventuell Default-Agents aus
- `shared/components/ChatInput.tsx` oder wo die Dropdown-Liste gebaut wird: Prüfe ob Tutor in der Dropdown-Liste enthalten ist
- Die Regex in `getDirectCallPattern()` schließt Tutor bereits ein (wurde gefixt), aber das Dropdown-Popup zeigt ihn nicht

**Bug 6 — Unicode-Escape im Agent Studio**
- `frontend/src/components/AgentStudio.jsx` ~Zeile 588: `"Sub-Agent-Men\u00FC"` → ersetze mit `"Sub-Agent-Menü"`

**Bug 7 — Research Agent nutzt Tutor-Tools**
- Wenn der alte rag_router zu Research delegiert hat, hatte Research Zugriff auf alle Tutor-Tools (show_card etc.)
- Nach Fix von Bug 1 sollte das nicht mehr passieren, da Research nur noch über den neuen Router dispatcht wird
- Verifiziere nach Bug 1 Fix: Research Agent hat nur seine eigenen Tools

### DESIGN (nach Bugs)

**Bug 8 — Input-Hintergrund bei @mention einfärben**
- Wenn User `@Agent` tippt, Input-Field-Hintergrund = Agent-Farbe bei 5% Opacity
- `@tag` selbst farbig markieren
- User hat bestätigt: gute Design-Entscheidung

**Bug 9 — Agent Studio Menü-Struktur**
- Aktuell: Plusi und Research haben Submenüs, Help und Tutor nicht
- Entscheide: alle inline aufklappbar, oder alle mit eigenem Submenü?

**Bug 10 — "Auto" Option im Agent-Selector**
- Tab-Toggle fürs Lock-Modus: "Auto" als Option hinzufügen (= Router entscheidet)

**Bug 11 — Tutor gibt nur Tool-Ergebnis ohne Text**
- "Warum ist die Banane krumm?" → nur Bild, kein Text
- Wahrscheinlich agent_loop Budget-Problem (Tool verbraucht alle Tokens)
- Investigiere nach den kritischen Fixes

**Bug 12 — "undefined/undefined" in Plusi Friendship Bar**
- Folge-Bug von Bug 3 — löst sich wenn @Help korrekt routet

### Reihenfolge

1 → 2 → 3 → Frontend bauen + testen → 4 → 5 → 6 → 7 → Frontend bauen + testen → 8-12

### Referenzen

- Architektur-Spec: `docs/superpowers/specs/2026-03-22-agentic-platform-architecture.md`
- Memory: `project_agentic_ui_bugs.md`
- Neue Dateien: `ai/agents.py`, `ai/router.py`, `ai/handoff.py`, `ai/memory.py`, `ai/help_agent.py`
- Frontend: `shared/config/agentRegistry.js`, `frontend/src/components/AgentStudio.jsx`, `frontend/src/components/AgenticCell.jsx`
