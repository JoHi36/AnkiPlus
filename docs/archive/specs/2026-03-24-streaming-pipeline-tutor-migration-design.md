# Streaming Pipeline + Tutor Migration Design

## Zusammenfassung

Vier zusammenhängende Änderungen an der Agent-Pipeline:

1. **Streaming für alle Agenten** — Neuer `stream_callback` Parameter in der Standard-Agent-Signatur. `_dispatch_agent()` leitet Chunks ans Frontend weiter. Agenten die streamen wollen, rufen den Callback auf. Agenten die es nicht tun, funktionieren wie bisher.

2. **Tutor-Extraktion** — Die ~500 Zeilen Tutor-Logik wandern aus handler.py in `ai/tutor.py` (Agent) und `ai/rag_pipeline.py` (Kartensuche). Der Tutor wird ein echter Agent der durch `_dispatch_agent()` läuft wie alle anderen.

3. **Handler.py wird reiner Dispatcher** — Nach der Migration: Routing → `_dispatch_agent()` → fertig. Kein Agent-spezifischer Code mehr. Der `if agent != 'tutor'`-Sonderfall verschwindet.

4. **Modell-Slots im Registry** — Drei Modell-Felder pro Agent (`premium_model`, `fast_model`, `fallback_model`). Ein globaler Toggle (Premium/Fast) bestimmt welches Modell genommen wird. `_dispatch_agent()` wählt das Modell und gibt es dem Agenten über `**kwargs`.

---

## 1. Streaming als Standard-Service

### Neue Agent-Signatur

```python
def run_agent(situation, emit_step=None, memory=None, stream_callback=None, **kwargs) -> dict:
```

`stream_callback` ist ein optionaler Callback mit Signatur:
```python
stream_callback(chunk: str, done: bool) -> None
```

- `chunk`: Textstück (kann leer sein bei `done=True`)
- `done`: True wenn der Agent fertig ist

### Verhalten in `_dispatch_agent()`

1. Baut einen `stream_callback` der Chunks als v2 `text_chunk` Events emittiert
2. Übergibt ihn dem Agent
3. Trackt ob der Agent gestreamt hat (`_used_streaming` Flag)
4. Nach dem Agent-Return:
   - Wenn gestreamt → kein zusätzlicher `text_chunk`, nur `agent_cell done` + `msg_done`
   - Wenn nicht gestreamt → sendet `result['text']` als einen `text_chunk` (wie bisher)

### Frontend

Keine Änderungen nötig. `useAgenticMessage.handleTextChunk()` akkumuliert schon inkrementell für jeden Agent.

---

## 2. RAG-Pipeline Extraktion

### Neues Modul: `ai/rag_pipeline.py`

Die Kartensuche ist der Denkprozess des Tutors — zu groß für eine Datei, daher ausgelagert.

#### Hauptfunktion

```python
def retrieve_rag_context(
    user_message: str,
    context: dict,
    config: dict,
    routing_result,          # Suchstrategie vom Router
    emit_step=None,          # Callback für Denkschritte
    embedding_manager=None,  # Optional, für semantische Suche
) -> RagResult:
```

Gibt zurück:
```python
@dataclass
class RagResult:
    rag_context: str        # Aufbereiteter Karten-Kontext für den Prompt
    citations: dict         # Quellen-Zuordnung (ID → Karte)
    cards_found: int        # Anzahl gefundener Karten
```

#### Was die Funktion intern macht

1. Entscheidet Suchstrategie (SQL, semantisch, beides) — aus `routing_result`
2. Ruft `HybridRetrieval.retrieve()` auf
3. Emittiert Denkschritte über `emit_step`: "Keyword-Suche...", "5 Treffer", "Semantische Suche...", "Quellen kombiniert"
4. Gibt aufbereiteten Kontext + Quellen zurück

#### HybridRetrieval Refactoring

Aktuell bekommt `HybridRetrieval` den ganzen Handler übergeben und ruft `self.ai._emit_pipeline_step()` auf.

Änderung: Bekommt stattdessen `emit_step` Callback:

```python
class HybridRetrieval:
    def __init__(self, embedding_manager, emit_step=None):
        self.emb = embedding_manager
        self.emit_step = emit_step or (lambda *a, **k: None)
```

Alle internen `self.ai._emit_pipeline_step(...)` Aufrufe werden zu `self.emit_step(...)`.

---

## 3. Tutor wird echter Agent

### `ai/tutor.py` — von Hülle zum echten Agent

```python
def run_tutor(situation, emit_step=None, memory=None, stream_callback=None, **kwargs):
    """Tutor Agent — kartenbasiertes Lernen mit RAG und Streaming."""

    config = kwargs.get('config', {})
    context = kwargs.get('context')
    history = kwargs.get('history', [])
    routing_result = kwargs.get('routing_result')
    model = kwargs.get('model')           # Vom Dispatcher ausgewählt
    fallback_model = kwargs.get('fallback_model')

    # 1. RAG-Kontext holen (Karten durchsuchen)
    rag_result = retrieve_rag_context(
        user_message=situation,
        context=context,
        config=config,
        routing_result=routing_result,
        emit_step=emit_step,
    )

    # 2. System-Prompt bauen
    system_prompt = get_system_prompt(context, config, rag_context=rag_result.rag_context)

    # 3. Antwort generieren (mit Streaming)
    emit_step("generating", "active")
    response_text = _generate_streaming(
        situation, model, config, system_prompt,
        history, rag_result, stream_callback,
    )
    emit_step("generating", "done")

    # 4. Handoff prüfen (an Research weiterleiten?)
    handoff = parse_handoff(response_text)
    if handoff and validate_handoff(handoff, 'tutor', config):
        # ... Handoff-Logik (bleibt Tutor-intern)

    # 5. Memory tracken
    if memory:
        count = memory.get('total_queries', 0)
        memory.set('total_queries', count + 1)

    return {
        'text': response_text,
        'citations': rag_result.citations,
        '_used_streaming': True,
    }
```

### Fehler-Behandlung

Die 3-stufige Fallback-Kette wandert 1:1 in den Tutor:

1. Primäres Modell mit RAG → bei Fehler:
2. Fallback-Modell mit reduziertem RAG (Top 3 Karten, kein Chat-Verlauf) → bei Fehler:
3. Fallback-Modell ohne RAG

Die Fallback-Logik wird später separat optimiert.

### `_generate_streaming()` Hilfsfunktion

Private Funktion in `ai/tutor.py` die den Gemini-Streaming-Call kapselt:

```python
def _generate_streaming(situation, model, config, system_prompt,
                        history, rag_result, stream_callback):
    """Ruft Gemini API mit Streaming auf, leitet Chunks über stream_callback."""

    def on_chunk(chunk, done, is_function_call=False):
        if not done and chunk and not is_function_call:
            if stream_callback:
                stream_callback(chunk, False)

    text = get_google_response_streaming(
        user_message=situation,
        model=model,
        api_key=config.get('api_key', ''),
        context=...,
        callback=on_chunk,
        system_prompt_override=system_prompt,
        config=config,
    )

    if stream_callback:
        stream_callback('', True)  # Done-Signal

    return text
```

---

## 4. Handler.py wird reiner Dispatcher

### Vorher (~535 Zeilen `get_response_with_rag`)

```
Routing
├── if nicht Tutor → _dispatch_agent()
└── if Tutor → 420 Zeilen inline RAG-Pipeline
```

### Nachher (~50 Zeilen)

```python
def get_response_with_rag(self, user_message, context=None, history=None,
                          mode='compact', callback=None, insights=None):
    self._current_request_steps = []
    self._current_step_labels = []
    request_id = getattr(self, '_current_request_id', None)

    # v2: Start
    self._emit_msg_event("msg_start", {"messageId": request_id or ''})
    self._emit_pipeline_step("orchestrating", "active")

    # Routing
    session_context = { ... }
    routing_result = route_message(user_message, session_context, self.config,
                                    card_context=context, chat_history=history)

    # Agent laden
    agent_def = get_agent(routing_result.agent) or get_default_agent()
    run_fn = lazy_load_run_fn(agent_def)

    # Dispatch — gleicher Weg für ALLE Agenten
    clean_msg = routing_result.clean_message or user_message
    return self._dispatch_agent(
        agent_name=routing_result.agent,
        run_fn=run_fn,
        situation=clean_msg,
        request_id=request_id,
        on_finished=agent_def.on_finished,
        extra_kwargs={
            'context': context,
            'history': history,
            'mode': mode,
            'insights': insights,
            'routing_result': routing_result,
            **agent_def.extra_kwargs,
        },
        callback=callback,
    )
```

Kein `if agent != 'tutor'` mehr. Ein Pfad für alle.

---

## 5. Modell-Slots im Agent Registry

### Neue Felder auf `AgentDefinition`

```python
@dataclass
class AgentDefinition:
    # ... bestehende Felder ...

    # Modell-Konfiguration
    premium_model: str = ''     # Modell für Premium-Modus
    fast_model: str = ''        # Modell für Fast-Modus
    fallback_model: str = ''    # Fallback wenn Hauptmodell fehlschlägt
```

### Registrierung

```python
register_agent(AgentDefinition(
    name='tutor',
    premium_model='gemini-3-flash-preview',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    ...
))

register_agent(AgentDefinition(
    name='help',
    premium_model='gemini-2.5-flash',   # Help braucht kein teures Modell
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    ...
))

register_agent(AgentDefinition(
    name='plusi',
    premium_model='claude-sonnet',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    ...
))
```

### Globaler Toggle

Config-Schlüssel: `model_mode` = `'premium'` | `'fast'`

Default: `'premium'`

### Modell-Auswahl in `_dispatch_agent()`

```python
# Modell bestimmen
mode = config.get('model_mode', 'premium')
if mode == 'fast':
    model = agent_def.fast_model or agent_def.premium_model
else:
    model = agent_def.premium_model or agent_def.fast_model
fallback = agent_def.fallback_model or model

# An Agent übergeben
agent_kwargs['model'] = model
agent_kwargs['fallback_model'] = fallback
```

Agenten die ein Modell fest verdrahtet haben (wie Help mit `HELP_MODEL`) werden umgestellt: Sie nehmen `kwargs.get('model')` und nutzen ihren internen Default nur als Fallback.

---

## Was sich NICHT ändert

- **Frontend** — Keine Änderungen. Streaming funktioniert schon.
- **Router** — Bleibt wie er ist. Entscheidet weiterhin welcher Agent.
- **Agent-Registrierung** — Gleiche Registry, nur 3 neue Felder.
- **Plusi, Research, Help** — Signaturen bleiben gleich (+ `stream_callback`). Interne Logik ändert sich minimal (Modell von außen statt fest verdrahtet).
- **Tests aus der letzten Session** — Alle 297 bestehenden Tests bleiben bestehen.

## Was sich ändert

| Datei | Änderung |
|-------|----------|
| `ai/handler.py` | Schrumpft von ~535 auf ~50 Zeilen (nur noch Routing + Dispatch) |
| `ai/tutor.py` | Wird von Hülle zum echten Agent (~200 Zeilen) |
| `ai/rag_pipeline.py` | Neu — extrahierte Kartensuche (~150 Zeilen) |
| `ai/retrieval.py` | HybridRetrieval bekommt Callbacks statt Handler |
| `ai/agents.py` | +3 Felder (premium_model, fast_model, fallback_model) |
| `_dispatch_agent()` | +Streaming-Support, +Modell-Auswahl |
| Alle 4 Agenten | +`stream_callback` Parameter, Modell von außen |
