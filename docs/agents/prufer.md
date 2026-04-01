# Prüfer-Agent

## 1. Übersicht

Der Prüfer-Agent ist der Bewertungsagent von AnkiPlus. Er läuft im Kanal **reviewer-inline** — direkt während der Kartenwiederholung, ohne eigenen Chat-Verlauf und ohne RAG. Zwei Modi:

- **MC-Generierung** (`generate_mc`): Erzeugt 4 Multiple-Choice-Optionen für eine Kartenfrage.
- **Freitext-Bewertung** (`evaluate_answer`): Bewertet die frei eingetippte Antwort des Lernenden gegen die korrekte Antwort.

Der Agent ist bewusst schlank: kein Reasoning-Display, keine Streaming-Ausgabe, keine Tool-Calls. Er liefert ein vollständiges Ergebnis-Dict, das die UI sofort rendern kann.

---

## 2. Kanal & UI

**Kanal:** `reviewer-inline`

Der Prüfer hat keinen eigenen Tab oder Canvas. Er ist nahtlos in den Reviewer eingebettet:

| UI-Element | Verwendung |
|---|---|
| `ReviewerDock` | Zeigt MC-Optionen unter der Karte als klickbare Chips |
| `DockEvalResult` | Zeigt Score (0–100) + Feedback-Text nach Freitext-Bewertung |
| `ChatInput` (Input-Dock) | Freitext-Eingabe im Reviewer; löst `evaluate_answer` aus |
| `MultipleChoiceCard` | Rendert die 4 MC-Optionen mit Erklärungen |

Der Reviewer zeigt nach dem Aufdecken der Karte entweder MC-Optionen (wenn generiert) oder das Freitext-Input-Dock. Nach der Abgabe erscheint das `DockEvalResult` mit Score und Feedback.

---

## 3. MC-Generierung

**Funktion:** `ai/prufer.py::generate_mc(question, correct_answer, deck_answers=None)`

Gemini generiert 4 Multiple-Choice-Optionen: 1 korrekte, 3 plausibel falsche Distraktoren. Jede Option enthält einen kurzen Erklärungssatz (max. 1 Satz).

**Eingaben:**

| Parameter | Typ | Beschreibung |
|---|---|---|
| `question` | `str` | Vorderseite der Karteikarte |
| `correct_answer` | `str` | Korrekte Antwort (Rückseite) |
| `deck_answers` | `list[str] \| None` | Optionale Antworten anderer Karten im Deck als Distraktor-Inspiration |

**Ausgabe:** `list` von 4 Dicts:
```python
[
  {"text": "...", "correct": True,  "explanation": "..."},
  {"text": "...", "correct": False, "explanation": "..."},
  ...
]
```

Die Liste wird nach der Generierung zufällig gemischt (`random.shuffle`). Bei AI-Fehler greift ein statischer Fallback mit Platzhalter-Optionen.

**Distraktor-Qualität:** Deck-Antworten aus `deck_answers` werden dem Prompt als "DECK-KONTEXT" mitgegeben. Gemini soll daraus thematisch verwandte, aber falsche Optionen ableiten — nicht einfach kopieren.

**Geplant:** Citations in MC-Erklärungen (Referenz auf verwandte Karten).

---

## 4. Freitext-Bewertung

**Funktion:** `ai/prufer.py::evaluate_answer(question, user_answer, correct_answer)`

Gemini vergleicht die Antwort des Lernenden mit der korrekten Antwort. Der Fokus liegt auf dem Delta: Was hat der Lernende geschrieben, was fehlte konkret? Die korrekte Antwort ist bereits sichtbar — Gemini erklärt sie nicht neu.

**Eingaben:**

| Parameter | Typ | Beschreibung |
|---|---|---|
| `question` | `str` | Die Kartenfrage |
| `user_answer` | `str` | Eingetippte Antwort des Lernenden |
| `correct_answer` | `str` | Korrekte Antwort (Rückseite) |

**Ausgabe:**
```python
{
  "score":    75,               # int, 0–100
  "feedback": "...",            # str, 1–2 Sätze
  "missing":  "..."             # str, optional (was konkret fehlte)
}
```

Bei AI-Fehler greift ein Wort-Overlap-Fallback: Übereinstimmung bedeutsamer Wörter (Stoppwörter gefiltert) → Score 0–100.

**Geplant:** Citations im Feedback-Text (Referenz auf Karten mit verwandtem Inhalt).

---

## 5. Citations

Der Prüfer-Agent akzeptiert einen `CitationBuilder` (`ai/citation_builder.py`) — er ist verdrahtet, generiert aber noch keine Citations:

```python
def run_prufer(..., citation_builder=None, ...):
    if citation_builder is None:
        citation_builder = CitationBuilder()
    ...
    return {..., "citations": citation_builder.build()}
```

**Geplant:**
- MC-Modus: Karten-Referenzen in den `explanation`-Feldern der Optionen
- Bewertungs-Modus: Referenzen auf thematisch verwandte Karten im Feedback-Text

---

## 6. Entry Point

**Datei:** `ai/prufer.py`
**Funktion:** `run_prufer(situation, mode, **kwargs)`
**Registriert in:** `ai/agents.py`

```python
run_prufer(
    situation='',           # User-Antworttext (evaluate) oder leer (MC)
    emit_step=None,
    memory=None,
    stream_callback=None,   # Nicht genutzt — Prüfer liefert vollständige Ergebnisse
    citation_builder=None,
    mode='evaluate',        # 'evaluate' | 'generate_mc'
    question='',
    correct_answer='',
    user_answer='',         # evaluate-Modus
    deck_answers=None,      # generate_mc-Modus
)
```

Rückgabe je Modus:

```python
# evaluate
{"text": "<feedback>", "evaluation": {"score": int, "feedback": str, "missing": str}, "citations": []}

# generate_mc
{"text": "", "mc_options": [...], "citations": []}
```

---

## 7. Key Files

| Datei | Inhalt |
|---|---|
| `ai/prufer.py` | Vollständige Agenten-Implementierung (evaluate + MC + entry point) |
| `ai/agents.py` | Agent-Registrierung |
| `ai/citation_builder.py` | CitationBuilder — verdrahtet, noch nicht aktiv genutzt |
| `frontend/src/components/ReviewerDock.jsx` | MC-Optionen und Ergebnis-Anzeige |
| `frontend/src/components/DockEvalResult.jsx` | Score + Feedback-Rendering |
| `frontend/src/components/MultipleChoiceCard.jsx` | MC-Option-Chips mit Erklärungen |
| `shared/components/MultipleChoiceCard.jsx` | Design-System-Primitive für MC |

---

## 8. Benchmarks

Geplant: Distraktor-Qualität, MC-Schwierigkeit, Bewertungs-Genauigkeit.

Kein Benchmark derzeit implementiert. Qualitätskontrolle läuft manuell über Testfälle mit bekannten Karteninhalten.
