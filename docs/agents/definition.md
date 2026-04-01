# Definition Agent

## Übersicht

Der **Definition Agent** generiert kontextsensitive Fachbegriff-Definitionen direkt aus dem Karteninhalt. Er wird nicht durch eine Chat-Eingabe ausgelöst, sondern durch Klick auf einen KG-markierten Term in der Kartenansicht. Sein Kanal ist `reviewer-term` — er ist ausschließlich an den ReviewerView gebunden.

Ziel: Der Lernende klickt auf einen Fachbegriff auf der Karte und erhält innerhalb weniger Sekunden eine präzise, quellenbasierte Definition — ohne die Review-Session zu unterbrechen.

---

## Kanal & UI

**Kanal:** `reviewer-term`

Der Definition Agent ist an den ReviewerView gekoppelt. Terme auf der Karte werden beim Rendern mit der CSS-Klasse `.kg-marker` versehen. Dieser Schritt erfolgt durch den KG-Builder beim Laden der Karte.

**Interaktionsfluss:**

1. Der Lernende sieht die Karte im ReviewerView. Markierte Terme erscheinen visuell hervorgehoben (`.kg-marker`).
2. Klick auf einen Term → `TermPopup` erscheint direkt unter dem Term.
3. Das Popup durchläuft sichtbare Lade-Schritte (Embedding-Suche, Definition generieren).
4. Ergebnis: Term-Name als Überschrift, generierte Definition mit `[N]`-Referenzen, Chips für verbundene Terme.

**Komponente:** `frontend/src/components/TermPopup.jsx`

Das TermPopup ist kein Modal — es ist ein kontextuelles Overlay, das am Term verankert bleibt und beim Scrollen oder Klick außerhalb geschlossen wird.

---

## Retrieval-Pipeline

Die Pipeline ist KG-basiert und nutzt gecachte Definitionen als ersten Auflösungsschritt.

```
Klick auf Term
    │
    ▼
KG-Store: Gecachte Definition vorhanden?
    ├─ Ja  → sofort zurückgeben (kein LLM-Call)
    └─ Nein
          │
          ▼
       Embedding-Suche
       Query: "Was ist {Term}? Definition"
       → embed via Gemini API
       → cosine similarity vs. ~8k Karten-Index
          │
          ▼
       Filterung
       Nur Karten, die den Term enthalten
       (card_ids aus KG-Store)
          │
          ▼
       Top 8 Karten → Gemini Flash
       Prompt: Definition mit [1], [2] Referenzen
          │
          ▼
       Ergebnis im KG-Store cachen
          │
          ▼
       TermPopup rendern
```

**Pipeline-Fork:** `ai/retrieval_agents/definition_retrieval.py` ist ein dedizierter Fork der RAG-Pipeline für den Definition Agent. Dieser Fork ist implementiert, wird aber noch nicht aktiv genutzt — der Agent verwendet aktuell eine eigene KG-basierte Suche direkt in `ai/definition.py`. Die Migration auf den Fork ist geplant.

---

## Connected Terms

Der KG-Graph liefert für jeden Term seine verbundenen Nachbar-Terme (Kanten im Wissensgraphen). Das TermPopup zeigt bis zu **6 verbundene Terme** als klickbare Chips unterhalb der Definition an.

Klick auf einen Chip:
- Schließt die aktuelle Definition nicht
- Lädt die Definition des Ziel-Terms nach (neuer Agent-Dispatch)
- Ermöglicht Navigation durch den Wissensgraphen ohne die Karte zu verlassen

Die verbundenen Terme werden aus `storage/kg_store.py` gelesen — kein separater API-Call.

---

## Citations

Der Definition Agent verwendet ausschließlich **Card Citations** — kein Web-Search, keine externen Quellen.

Jede Quell-Karte, die zur Generierung der Definition beigetragen hat, wird über `CitationBuilder` registriert:

- `CitationBuilder` sammelt alle verwendeten Karten-IDs
- `CitationRef` rendert `[1]`, `[2]` etc. innerhalb der Definitions-Text
- `CitationPreview` zeigt beim Hover/Klick die Original-Karte als Vorschau

Das Citation-System stellt sicher, dass der Lernende nachvollziehen kann, aus welchen seiner eigenen Karten die Definition abgeleitet wurde — Transparenz über den eigenen Wissensstand.

---

## Entry Point

```
ai/definition.py → run_definition(term, card_ids, session_id)
```

Registriert in `ai/agents.py` als vollständiger Agent. Dispatch über `handler._dispatch_agent()` — derselbe Mechanismus wie Tutor und Research.

Der Agent empfängt:
- `term` — der angeklickte KG-Term (String)
- `card_ids` — Liste der Karten-IDs aus dem KG-Store, die diesen Term enthalten
- `session_id` — aktuelle Review-Session für Kontext

Der Agent gibt strukturierte Events zurück (streaming), die das TermPopup progressiv befüllen.

---

## Key Files

| Datei | Rolle |
|-------|-------|
| `ai/definition.py` | Agent Entry Point — `run_definition()`, KG-Lookup, LLM-Dispatch |
| `storage/kg_store.py` | KG Persistence — Terme, Kanten, gecachte Definitionen |
| `ai/kg_builder.py` | KG Graph Builder — Terme extrahieren, Kanten aufbauen |
| `ai/embeddings.py` | Embedding API + Karten-Index (cosine similarity) |
| `ai/retrieval_agents/definition_retrieval.py` | Pipeline-Fork (implementiert, noch nicht aktiv) |
| `frontend/src/components/TermPopup.jsx` | UI — Term-Name, Lade-Schritte, Definition, Connected-Term-Chips |
| `frontend/src/components/ReviewerView.jsx` | Event Handling — `.kg-marker` Klick-Handler, Popup-Positionierung |

---

## Benchmarks

Noch keine agent-spezifischen Metriken definiert.

Geplant:
- **Definitions-Qualität** — manuelle Bewertung (Präzision, Vollständigkeit, Ton)
- **Quellen-Relevanz** — cosine-Score der Top-8-Karten vs. Term-Query
- **Cache-Hit-Rate** — Anteil der Klicks, die ohne LLM-Call beantwortet werden

Ziel-Werte werden nach erstem produktivem Einsatz festgelegt.
