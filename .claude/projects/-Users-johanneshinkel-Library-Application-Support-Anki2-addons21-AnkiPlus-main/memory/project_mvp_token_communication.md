---
name: MVP Token/Quota Communication Issues
description: Critical UX issues with token quota exhaustion - confusing error messages, hidden weekly limit, embedding token costs
type: project
---

MVP TODO: Token-Budget Kommunikation muss grundlegend verbessert werden.

**Probleme (entdeckt 2026-03-27):**
1. **Fehlermeldung unklar:** Wenn Quota leer ist, zeigt die App nur "Ein Fehler ist aufgetreten" — kein Hinweis auf Quota-Erschöpfung
2. **Wochenlimit unsichtbar:** UI zeigt nur Tageslimit (50% frei), aber Wochenlimit war schon bei 0 → User verwirrt warum nichts geht
3. **Embedding-Token-Verbrauch:** Initiales Embedding verbraucht massiv Tokens, User merkt es nicht und wundert sich warum Wochenlimit so schnell leer ist
4. **Keine differenzierte Kommunikation:** Tages- vs. Wochenlimit wird nicht unterschieden in der UI

**Why:** User verliert Vertrauen wenn die App ohne klare Erklärung aufhört zu funktionieren. Besonders bei zahlenden Max-Tier Nutzern.

**How to apply:**
- Quota-Exceeded Error muss spezifische UI zeigen (nicht generischer Fehler)
- Settings-Sidebar muss BEIDE Limits zeigen (Tag + Woche)
- Embedding-Kosten müssen separat oder transparenter gehandhabt werden
- Evtl. Embedding auf separates Budget oder Flat-Rate
