# Anki Chatbot Addon - Konzept

## Vision

Ein intelligenter Chatbot für Anki, der Lernende bei ihrer täglichen Arbeit mit Karteikarten unterstützt und langfristig zu einem autonomen Agenten entwickelt wird, der proaktiv beim Lernen hilft.

## Kernidee

Der Chatbot soll nicht nur reaktiv auf Fragen antworten, sondern aktiv beim Lernprozess unterstützen. Er versteht den Kontext des Nutzers (aktuelle Karten, Lernfortschritt, Schwierigkeiten) und kann gezielt helfen.

## Hauptfunktionen (geplant)

### Phase 1: Chatbot (Basis)
- **Kontextueller Dialog**: Der Chatbot versteht, was der Nutzer gerade in Anki macht
- **Lernunterstützung**: Hilfe bei der Erstellung von Karten, Erklärung von Konzepten, Lernstrategien
- **Natürliche Sprache**: Kommunikation in natürlicher Sprache, keine komplexen Befehle nötig

### Phase 2: Agentische Funktionen (schrittweise Entwicklung)

#### 2.1 Kontext-Erkennung (Nächste Schritte)
- **Aktuelle Karte erkennen**: Der Agent erkennt automatisch, welche Karte gerade offen ist
- **Karten-Status verstehen**: Unterscheidet zwischen aufgedeckter und noch nicht aufgedeckter Karte
- **Wiederholungszahl analysieren**: Erkennt, wie gut eine Karte bereits bekannt ist basierend auf Wiederholungszahl und Intervall

#### 2.2 Adaptive Unterstützung
- **Vor Aufdeckung**: 
  - Hinweise anbieten
  - Multiple Choice Fragen stellen
  - Lernstrategien vorschlagen
- **Nach Aufdeckung**:
  - Konkrete Fragen zur Karte stellen
  - Erklärungen anbieten
  - Schwierigkeitsgrad anpassen basierend auf Wiederholungszahl

#### 2.3 Erweiterte Funktionen (später)
- **Proaktive Unterstützung**: Der Agent erkennt Lernschwierigkeiten und schlägt Lösungen vor
- **Automatisierte Aufgaben**: Kann bestimmte Aufgaben selbstständig ausführen (z.B. Karten erstellen, Tags organisieren)
- **Lernanalyse**: Analysiert Lernmuster und gibt personalisierte Empfehlungen
- **Adaptive Hilfe**: Passt sich an den individuellen Lernstil an

## Nutzerinteraktion

### Interface
- **Seitliches Panel**: Integriert in Anki als Dock-Widget auf der linken Seite, nicht als separates Popup-Fenster
- **Schneller Zugriff**: Prominenter Floating Action Button (FAB) in der oberen rechten Ecke für schnelles Öffnen/Schließen
- **Nicht aufdringlich**: Unterstützt den Workflow, ohne zu stören - Panel kann geschlossen werden, Button bleibt sichtbar
- **Intuitive Bedienung**: Ein Klick öffnet/schließt das Panel, ähnlich wie in modernen IDEs (z.B. Cursor)

### Kommunikation
- **Natürliche Gespräche**: Wie mit einem Lernpartner
- **Kontextbewusst**: Versteht, welche Karten gerade gelernt werden
- **Multimodal**: Kann später auch Bilder, Formeln, etc. verarbeiten

## Technische Vision (hochlevel)

- **KI-Integration**: Nutzt moderne LLMs für intelligente Antworten
- **Anki-Integration**: Tiefe Integration in Anki's Datenstrukturen
- **Erweiterbar**: Architektur ermöglicht einfaches Hinzufügen neuer Funktionen
- **Performant**: Schnelle Antwortzeiten, keine Verzögerungen im Lernfluss

## Offene Fragen / Zu klärende Punkte

- Welche spezifischen Lernaufgaben soll der Agent übernehmen können?
- Wie proaktiv soll der Agent sein? (Benachrichtigungen, Vorschläge)
- Welche Daten des Nutzers darf der Agent verwenden?
- Soll der Agent auch offline funktionieren können?
- Wie soll die Balance zwischen Automatisierung und Nutzerkontrolle sein?

## Entwicklungspfad

1. ✅ **Basis-Integration**: Chatbot in Anki sichtbar machen
2. ✅ **UI-Verbesserung**: Seitliches Panel (Dock-Widget), prominenter Floating Button
3. ✅ **Moderne Frontend-Architektur**: Migration zu React + Vite + Tailwind CSS + DaisyUI
4. ⏳ **KI-Integration**: Verbindung zu LLM-API
5. ⏳ **Kontextverständnis**: Anki-Daten lesen und verstehen
6. ⏳ **Agentische Funktionen**: Proaktive Unterstützung und Automatisierung

## Entwicklungsworkflow

### Frontend-Entwicklung

Das Frontend wird mit modernen Web-Technologien entwickelt:

1. **Entwicklung**:
   - Öffne Terminal im `frontend/` Ordner
   - `npm install` (einmalig)
   - `npm run dev` startet Development-Server
   - Entwickle im Browser (Chrome/Safari) mit Mock-Daten
   - Änderungen sind sofort sichtbar (Hot Module Replacement)

2. **Build für Anki**:
   - `npm run build` erstellt optimierte Dateien
   - Dateien werden automatisch in `web/` Ordner geschrieben
   - Anki lädt diese Dateien beim Start

3. **Warum dieser Ansatz?**
   - **Schnell**: Mit Tailwind + DaisyUI baust du UIs in Minuten statt Stunden
   - **Modern**: React ermöglicht State-Management und Komponenten-Wiederverwendung
   - **Testbar**: Du testest die UI im Browser, bevor du sie in Anki lädt
   - **Professionell**: Gleiche Tools wie in modernen Web-Apps (Google AI Studio, etc.)

### Warum nicht "RAW.js"?

Die ursprüngliche Implementierung nutzte Vanilla JavaScript und manuelles CSS. Das ist mühsam und fehleranfällig:

- **Problem**: Jede UI-Änderung erfordert manuelles DOM-Manipulation
- **Problem**: Keine State-Management (mühsam, fehleranfällig)
- **Problem**: Keine Komponenten-Bibliotheken (alles selbst bauen)

**Lösung**: React + Tailwind + DaisyUI gibt dir:
- ✅ Komponenten-basierte Architektur
- ✅ Automatisches State-Management
- ✅ Fertige UI-Komponenten (Buttons, Cards, etc.)
- ✅ Utility-First CSS (kein manuelles CSS schreiben)

---

*Diese Datei wird kontinuierlich aktualisiert, um das Konzept zu schärfen.*

