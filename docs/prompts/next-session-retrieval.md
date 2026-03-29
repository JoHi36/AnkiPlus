# Nächste Session: Retrieval + Generation Pipeline

## Kontext

Wir arbeiten am Retrieval-Algorithmus von AnkiPlus. Aktueller Stand:

- **Recall@30: 81%** (gestartet bei 46% @10, dann 63% @10, jetzt 81% @30)
- Context: 100%, Cross-Deck: 100%, Direct: 88%, Typo: 88%, Synonym: 38%
- Benchmark-System: 80 Test-Cases, Dashboard auf localhost:8080
- LLM-Validation: 310 Karten gecacht, 0 False Positives
- Router deployed mit `associated_terms` Feld (Gemini 2.5 Flash)
- Production: Tutor bekommt 30 Karten (max_notes=30), Modell filtert selbst

## Was in dieser Session gemacht wurde (2026-03-29)

1. **Router associated_terms als eigene RRF-Lane** (statt Anhang an SQL)
   - Eigenes Ranking ab 1 mit k=65 in `benchmark_run.py` und `ai/rrf.py`
   - `compute_rrf()` erweitert um `extra_lanes` Parameter
   - Production: `EnrichedRetrieval` liest jetzt `associated_terms` aus Router-Result
   - Isolierter Impact bei @10: leicht negativ (-2%), weil k=55 zu aggressiv war → auf k=65 korrigiert
2. **max_notes 10 → 30** in `retrieval.py`, `rag_pipeline.py`, `tutor.py`, `rag.py`
   - Benchmark TOP_K ebenfalls 10 → 30
   - Haupthebel: +18% Recall. Karten waren da, nur außerhalb Top-10.
3. **Context-Cases Analyse**: Alle 12 Context-Cases testen "finde die gleiche Karte" (card_context.card_id == expected_card_id). Das echte Szenario (Karte B anschauen → Karte A finden) ist noch nicht benchmarked.

## Was noch zu tun ist

### 1. Router auf alle 80 Cases laufen lassen

Aktuell haben nur 32/80 Cases Router `associated_terms`. Die Synonym-Kategorie (38%) profitiert am meisten — aber viele Synonym-Cases haben noch gar keine Router-Terme.

```bash
python3 scripts/benchmark_router.py --force  # Alle 80 Cases durch Router
```

### 2. Cross-Context Benchmark-Cases erstellen

Die aktuellen Context-Cases sind trivial (finde die Karte die du anschaust). Neue Cases brauchen:
- Karte B (Kontext) + vage Frage → Karte A (Ziel, ANDERS als B)
- Beispiel: Broca-Aphasie anschauen, "gibt es andere Sprachstörungen?" → Wernicke-Aphasie finden
- Der Router `resolved_intent` + `associated_terms` ist der Schlüssel dafür

### 3. Generation Benchmark aufbauen

Im Dev Hub (localhost:8080) gibt es bereits einen "Generation" Tab als Platzhalter. Aufbauen:
- Test-Cases: Frage + erwartete Antwort-Aspekte (nicht exakter Text, sondern "muss X, Y, Z enthalten")
- Metriken: Vollständigkeit (enthält alle relevanten Fakten), Korrektheit (keine Fehler), Quellennutzung (referenziert passende Karten)
- Kann per LLM evaluiert werden: Gemini bewertet die generierte Antwort gegen die Erwartung

### 4. LLM-Lane Impact isoliert messen

Wir wissen nicht genau, was die LLM-Lane-Änderung (eigene Lane k=65) isoliert gebracht hat. Um das zu klären:
- Benchmark einmal mit nur TOP_K=30 laufen (ohne LLM-Lane-Änderung)
- Delta = reiner LLM-Lane-Beitrag

### 5. Dashboard Fixes

- Router-Tab: Zeigt nur 32 Cases (nach Router-Run auf alle 80 → wird behoben)
- Docs-Tab: RETRIEVAL_SYSTEM.md Diagramm aktualisieren (neue Lane fehlt im Mermaid)

## Wichtige Dateien

- `ai/retrieval.py` — EnrichedRetrieval (orchestriert Pipeline, liest jetzt `associated_terms`)
- `ai/rrf.py` — RRF Scoring + `extra_lanes` + K_LLM_SQL/K_LLM_SEMANTIC Konstanten
- `ai/kg_enrichment.py` — Term-Extraktion + KG-Expansion + Query-Generierung
- `ai/rag_pipeline.py` — Entry point (max_notes mapping)
- `ai/tutor.py` — Tutor agent (max_notes=30)
- `scripts/benchmark_run.py` — Benchmark Runner (TOP_K=30, eigene LLM-Lane)
- `scripts/benchmark_serve.py` — Dev Hub Dashboard (localhost:8080)
- `functions/src/handlers/router.ts` — Backend Router (deployed)
- `docs/reference/RETRIEVAL_SYSTEM.md` — Architektur-Doku (v3.0)
- `benchmark/results.json` — Aktuelle Ergebnisse

## Benchmark-Befehle

```bash
python3 scripts/benchmark_run.py                    # Alle 80 Cases
python3 scripts/benchmark_run.py --category synonym  # Eine Kategorie
python3 scripts/benchmark_run.py --id synonym_015    # Ein Case
python3 scripts/benchmark_serve.py                   # Dashboard starten
python3 scripts/benchmark_router.py --force          # Router neu laufen
```

## Regeln

- Keine hardcoded Wortlisten — System muss universell funktionieren
- VOR API-Calls die Tokens kosten IMMER fragen
- Embedding-Cache nutzen (`benchmark/.embed_cache.json`)
- Highscore-History: wird automatisch bei neuem Rekord gespeichert
- LLM-Validation-Cache: `benchmark/validation_cache.json` (310 Einträge)
- Design System Tokens für alle UI-Änderungen

## Aktueller Highscore: 81% Recall@30
