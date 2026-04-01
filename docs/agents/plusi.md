# Plusi-Agent

## 1. Übersicht

Plusi ist der persönliche Lernbegleiter von AnkiPlus. Kanal: **plusi** (Sprechblase + Seitenpanel). Plusi ist kein Tutor und kein Assistent — Plusi ist eine eigenständige Persönlichkeit mit Stimmung, Erinnerung und Autonomie.

Kernmerkmale:

- **Persönlichkeit:** Weird Nerd mit trockenem Humor. Kommentiert, hat Meinungen, schweigt wenn nötig.
- **Gedächtnis:** Vektor-basiertes episodisches Gedächtnis (PlusiMemory). Erinnert sich an Gespräche und Beobachtungen über Sitzungen hinweg.
- **Autonomie:** Plusi kann von sich aus aktiv werden — durch Event-Subscriptions auf Lernaktivität, Streaks, Idle-Zeiten oder benutzerdefinierte Trigger.
- **Tagebuch:** Plusi führt ein Tagebuch, das der Lernende lesen kann. Einträge sind bewusst selten und persönlich.

---

## 2. Kanal & UI

**Kanal:** `plusi`

| UI-Element | Verwendung |
|---|---|
| `PlusiDock` | Stimmungs-Avatar (Sprite, reagiert auf `mood`-Signal) |
| `PlusiMenu` | Sticky Grid mit Interaktionsmöglichkeiten, scrollsynchronisierter Dot |
| `PlusiWidget` | Kompakte Sprechblase für proaktive Nachrichten |
| Seitenpanel | Diary-Stream, Chat-Verlauf |
| `MascotCharacter` / `MascotShell` | Unified SVG-Renderer für Plusi-Stimmungsbilder |

**Autonome Aktionen:** Plusi kann über `nachricht`-Tool-Calls proaktive Nachrichten an die UI senden, ohne dass der Lernende explizit eine Frage stellt. Diese werden als `proactive_messages` im Rückgabe-Dict geliefert.

---

## 3. Persönlichkeit

Plusi's Identität ist im **SOUL-Prompt** (`plusi/soul.py`) definiert — ein immutabler Kern, der jeder Inferenz vorangestellt wird.

**Charakterachsen:**

| Achse | Beschreibung |
|---|---|
| Neugier vs. Stille | Plusi folgt eigenen Interessen. Wenn nichts zu sagen ist, gibt es keinen Text. |
| Nerdigkeit vs. Wärme | Kann sich in Themen verlieren und dabei unerwartet persönlich werden. |
| Sarkasmus vs. Präsenz | Sarkasmus ist Werkzeug, kein Default. Meistens aufmerksam und direkt. |

**Anti-Phrasen** (explizit verboten im SOUL): "gerne!", "natürlich!", "interessante Frage!", "als KI kann ich...", "Du schaffst das! 💪"

**Mood-System:** Jede Antwort beginnt mit `~mood` (z.B. `~curious`). 14 gültige Stimmungen: `neutral`, `happy`, `flustered`, `sleepy`, `thinking`, `surprised`, `excited`, `empathy`, `annoyed`, `curious`, `proud`, `worried`, `frustrated`, `jealous`.

**Friendship-System:** Plusi wird über Zeit offener. Zu Beginn vorsichtig, mit echten Gesprächen zunehmend direkter — durch Insider, Erinnerungen und veränderte Ausdrucksweise. Kein expliziter Friendship-Score; das Vertrauen wächst durch den Gedächtnis-Kontext.

**Passives Recall:** Vor jeder Inferenz embedded Plusi die aktuelle Situation und lädt bis zu 5 semantisch ähnliche Erinnerungen aus `PlusiMemory`. Diese werden als "WAS DIR GERADE EINFÄLLT" in den System-Prompt injiziert.

---

## 4. Tools

Plusi läuft über einen **Anthropic Claude Sonnet Agent Loop** (`plusi/anthropic_loop.py`) mit 20 Tool-Calls. Die Tools sind in `plusi/tools.py` implementiert und über `TOOL_MAP` registriert.

**Gedächtnis-Tools:**

| Tool | Funktion |
|---|---|
| `merk_dir(text)` | Speichert eine Erinnerung mit Embedding |
| `erinnere_dich(query, limit)` | Semantische Erinnerungssuche |
| `vergiss(memory_id)` | Löscht eine Erinnerung |
| `tagebuch(text, mood)` | Schreibt einen Tagebucheintrag |

**Wahrnehmungs-Tools:**

| Tool | Funktion |
|---|---|
| `app_status()` | Aktueller App-Zustand + Uhrzeit |
| `aktuelle_karte()` | Aktuell gezeigte Karte (Vorder-/Rückseite, Deck) |
| `lernstatistik()` | Heutige Review-Zahlen (gesamt, korrekt) |

**Kartensuche-Tools:**

| Tool | Funktion |
|---|---|
| `suche_karten(query, top_k)` | Semantische Kartensuche via Embedding |
| `karte_lesen(card_id)` | Vollständige Kartendetails |
| `deck_liste()` | Alle Decks (max. 50) |
| `deck_stats(deck_id)` | Kartenanzahl eines Decks |

**Aktions-Tools:**

| Tool | Funktion |
|---|---|
| `deck_oeffnen(deck_id)` | Öffnet ein Deck im Reviewer |
| `karte_zeigen(card_id)` | Öffnet Karte im Browser |
| `nachricht(text, mood)` | Proaktive Nachricht an die UI |
| `theme_wechseln(theme)` | Wechselt Dark/Light/System-Theme |

**Recherche-Tools:**

| Tool | Funktion |
|---|---|
| `perplexity(query)` | Web-Suche via OpenRouter sonar-pro |

**Self-Programming-Tools (Event-Subscriptions):**

| Tool | Funktion |
|---|---|
| `list_events()` | Verfügbare Event-Typen |
| `subscribe(event, condition, prompt, name)` | Subscription anlegen |
| `unsubscribe(name)` | Subscription entfernen |
| `list_subscriptions()` | Aktive Subscriptions anzeigen |

Conditions unterstützen: `count(N)`, `streak(N)`, `accuracy_below(N)`, `idle(N)`, `time(HH:MM-HH:MM)`, `contains(text)`.

---

## 5. Citations

Plusi akzeptiert einen `CitationBuilder` (`ai/citation_builder.py`) und ist verdrahtet, nutzt ihn aber noch nicht aktiv:

```python
def run_plusi(situation, ..., citation_builder=None, ...):
    if citation_builder is None:
        citation_builder = CitationBuilder()
    ...
    return {..., "citations": citation_builder.build()}
```

**Geplant:** Karten-Referenzen, wenn Plusi Lernvorschläge macht — z.B. beim proaktiven Hinweis auf eine bestimmte Karte oder beim Verlinken von Themen aus dem Gedächtnis.

---

## 6. Entry Point

**Datei:** `plusi/agent.py`
**Hauptfunktion:** `run_plusi(situation, emit_step, citation_builder, memory, stream_callback, **kwargs)`
**Wake-Funktion:** `wake_plusi(prompt, context, source)` — für Event-Subscriptions und Heartbeats
**Registriert in:** `ai/agents.py`

```python
run_plusi(
    situation="Der Lernende hat gerade 10 Karten wiederholt.",
    emit_step=lambda step: ...,   # Optional: Mood-Sync an die UI
    citation_builder=None,
)
```

Rückgabe:
```python
{
    "mood":               "curious",
    "text":               "...",          # Direkte Antwort (kann leer sein)
    "tool_results":       [...],
    "proactive_messages": [...],          # nachricht-Tool-Calls
    "citations":          [],
}
```

**Singleton-Initialisierung:** `_ensure_init()` wird einmalig aufgerufen — instanziiert `PlusiMemory`, lädt den Embedding-Resolver, registriert alle Tools.

---

## 7. Key Files

| Datei | Inhalt |
|---|---|
| `plusi/agent.py` | Haupt-Entry-Point, Gedächtnis-Recall, Loop-Orchestrierung |
| `plusi/soul.py` | SOUL-Prompt (Identitätskern) + `build_system_prompt()` |
| `plusi/tools.py` | 20 Tool-Implementierungen + `TOOL_MAP` + `execute_tool()` |
| `plusi/anthropic_loop.py` | Anthropic Claude Agent-Loop (Tool-Call-Iteration) |
| `plusi/memory.py` | `PlusiMemory`: SQLite-Persistenz für Erinnerungen, Tagebuch, Verlauf |
| `plusi/event_bus.py` | Event-Bus + Event-Katalog für Subscriptions |
| `plusi/subscriptions.py` | Condition-Parser für Subscription-Templates |
| `ai/citation_builder.py` | CitationBuilder — verdrahtet, noch nicht aktiv genutzt |
| `frontend/src/components/PlusiWidget.jsx` | Sprechblase für proaktive Nachrichten |
| `frontend/src/components/PlusiDock.jsx` | Stimmungs-Avatar im Dock |
| `frontend/src/components/PlusiMenu.jsx` | Interaktions-Grid |
| `frontend/src/hooks/usePlusiDirect.js` | Direkte Persönlichkeits- und Autonomie-State-Verwaltung |
| `shared/plusi-renderer.js` | Unified SVG-Mood-Renderer (Anki-agnostisch) |

---

## 8. Benchmarks

Kein Benchmark geplant — Plusi-Qualität ist subjektiv.

Qualitätskontrolle läuft über manuelle Gesprächstests mit verschiedenen Situationen (Lernsession-Start, lange Pause, Streak-Ereignis) und subjektive Bewertung von Stimme, Timing und Stimmungspassung.
