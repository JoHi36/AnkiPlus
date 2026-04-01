# DSGVO Compliance — Phase 1: Rechtliche Dokumente

## Scope

Phase 1 erstellt die rechtlich notwendigen Seiten (Datenschutzerklärung, Impressum) und integriert sie in die Landing Page. Technische Maßnahmen (Account-Löschung, Datenexport, Cookie-Banner) sind Phase 2.

## Datenfluss-Audit (Basis für Datenschutzerklärung)

### Externe Dienste, an die Nutzerdaten fließen

| # | Dienst | Betreiber | Daten | Rechtsgrundlage | Region |
|---|--------|-----------|-------|-----------------|--------|
| 1 | Firebase Authentication | Google Ireland Ltd. | Email, UID, Auth-Tokens | Art. 6(1)(b) Vertragserfüllung | US (Multi-Region) |
| 2 | Cloud Firestore | Google Ireland Ltd. | Nutzerprofil, Usage-Daten, Analytics | Art. 6(1)(b) + (f) berechtigtes Interesse | EU (europe-west1) |
| 3 | Cloud Functions / Cloud Run | Google Ireland Ltd. | API-Requests, Chat-Nachrichten | Art. 6(1)(b) Vertragserfüllung | EU (europe-west1) |
| 4 | OpenRouter API → Google Gemini | OpenRouter Inc. (US) | Chat-Verlauf, Karteninhalte, System-Prompt | Art. 6(1)(b) Vertragserfüllung | Global |
| 5 | OpenRouter API → Perplexity Sonar | OpenRouter Inc. (US) | Research-Anfragen | Art. 6(1)(b) Vertragserfüllung | Global |
| 6 | Google Gemini Embedding API | Google Ireland Ltd. | Karteninhalte (Text, max 2000 Zeichen) | Art. 6(1)(b) Vertragserfüllung | US |
| 7 | Stripe | Stripe Technology Europe Ltd. (IE) | Email, User-ID, Zahlungsdaten | Art. 6(1)(b) Vertragserfüllung | EU/US |
| 8 | PubMed / NCBI | US Dept. of Health | Suchanfragen (medizinische Begriffe) | Art. 6(1)(f) berechtigtes Interesse | US |
| 9 | Wikipedia / Wikimedia | Wikimedia Foundation | Suchanfragen | Art. 6(1)(f) berechtigtes Interesse | Multi |
| 10 | PubChem / NCBI | US Dept. of Health | Suchanfragen (chemische Verbindungen) | Art. 6(1)(f) berechtigtes Interesse | US |
| 11 | Google Fonts (Landing Page) | Google Ireland Ltd. | IP-Adresse | Art. 6(1)(f) berechtigtes Interesse | US |
| 12 | Vercel (Hosting Landing Page) | Vercel Inc. (US) | Request-Daten, IP-Adresse | Art. 6(1)(f) berechtigtes Interesse | Global |

### Lokale Datenspeicherung (Anki-Addon)

- `card_sessions.db` — Chat-Verlauf, Kartenreviews, Embeddings, Knowledge Graph
- `config.json` — Auth-Tokens, Device-ID, Einstellungen (unverschlüsselt)
- `plusi.db` — Plusi-Companion-Daten (Persönlichkeit, Tagebuch)

### Anonyme Nutzer

- Device-ID (UUID) + IP-Adresse werden in Firestore gespeichert
- Tägliche Usage-Quotas getrackt
- Rechtsgrundlage: Art. 6(1)(f) berechtigtes Interesse (Missbrauchsschutz)

### AVV-Status (Auftragsverarbeitungsverträge)

| Anbieter | AVV-Typ | Status |
|----------|---------|--------|
| Google (Firebase, Gemini, Fonts) | Cloud Data Processing Addendum (CDPA) | Muss in Cloud Console akzeptiert werden |
| OpenRouter | DPA in ToS integriert | Automatisch gültig; ZDR + EU-Routing prüfen |
| Stripe | DPA in Stripe Services Agreement | Automatisch gültig |
| Vercel | Data Processing Addendum | Muss akzeptiert werden |

## Deliverables

### 1. Datenschutzerklärung (`/datenschutz`)

Vollständige Datenschutzerklärung nach DSGVO Art. 13/14 mit folgenden Abschnitten:

1. **Verantwortlicher** — Name, Adresse, Kontakt
2. **Überblick der Verarbeitung** — Zusammenfassung aller Datenverarbeitungen
3. **Rechtsgrundlagen** — Art. 6(1)(a)-(f) für jede Verarbeitung
4. **Datenverarbeitung im Detail:**
   - Hosting und Bereitstellung (Vercel)
   - Nutzerkonto und Authentifizierung (Firebase Auth)
   - KI-gestützte Lernunterstützung (OpenRouter, Gemini) — mit explizitem KI-Hinweis
   - Recherche-Funktion (PubMed, Wikipedia, PubChem)
   - Embedding-Verarbeitung (Gemini Embedding API)
   - Zahlungsabwicklung (Stripe)
   - Nutzungsanalyse und Quotenverwaltung (Firestore)
   - Anonyme Nutzung (Device-ID, IP-basierte Quotas)
   - Lokale Datenspeicherung (SQLite im Anki-Addon)
   - Google Fonts
5. **Empfänger und Drittlandtransfer** — Alle 12 Dienste mit Transfermechanismus (EU-US DPF, SCCs)
6. **Speicherdauer** — Pro Datenkategorie
7. **Betroffenenrechte** — Art. 15-22 (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch)
8. **Beschwerderecht** — Zuständige Aufsichtsbehörde
9. **Automatisierte Entscheidungsfindung** — KI-Nutzung, kein Profiling mit rechtlicher Wirkung
10. **Änderungen** — Hinweis auf mögliche Aktualisierungen

**Sprache:** Deutsch (Hauptzielgruppe). Englische Version als Folgeaufgabe.

**Platzhalter für persönliche Daten:** Der Verantwortliche-Abschnitt enthält `[DEIN NAME]`, `[DEINE ADRESSE]`, `[DEINE EMAIL]` — der Nutzer füllt diese selbst aus.

### 2. Impressum (`/impressum`)

Nach §5 DDG (ehemals TMG, geändert Mai 2024):

1. Vollständiger Name / Firmenname
2. Ladungsfähige Anschrift
3. Kontaktdaten (E-Mail, Telefon oder schnelle Kontaktmöglichkeit)
4. USt-IdNr. (falls vorhanden)
5. Verantwortlich für den Inhalt nach §18 Abs. 2 MStV
6. EU-Streitschlichtung (Link + Hinweis)

**Platzhalter:** Gleiche `[DEIN NAME]` etc. wie Datenschutzerklärung.

### 3. Footer-Update (Landing Page)

- "Privacy" → "Datenschutz" (Link zu `/datenschutz`)
- "Terms" → "Impressum" (Link zu `/impressum`)
- Copyright: "© 2025 ANKI+" → "© 2026 ANKI+" (aktuelles Jahr)
- Beide Links als `<Link to="...">` (React Router), nicht `<a href="#">`

### 4. Routen (App.tsx)

```
/datenschutz  → DatenschutzPage
/impressum    → ImpressumPage
```

## Seiten-Design

Beide Seiten folgen dem Muster der AuthPage:
- `PageNav` oben für konsistente Navigation
- `max-w-4xl mx-auto px-6 py-16` Container
- Überschriften in `text-white/[0.92]`, Fließtext in `text-white/[0.55]`
- Abschnittsüberschriften als `text-lg font-semibold` mit `mt-10 mb-4`
- Links in `text-[#0a84ff]`
- Tabellen mit `border-white/[0.06]` Borders
- Zurück-zur-Startseite-Link am Ende

## Nicht in Scope (Phase 2+)

- Cookie-Banner / Consent-Management
- Account-Löschfunktion (Backend-Endpoint)
- Datenexport-Endpoint
- KI-Hinweis in der Anki-App
- Verarbeitungsverzeichnis (Art. 30, internes Dokument)
- DSFA (Datenschutz-Folgenabschätzung)
- AGB / Terms of Service
- Englische Übersetzungen
