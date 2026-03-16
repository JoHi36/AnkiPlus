# Briefing: Theme-System Debugging & Crash-Fixes

## 📋 Zusammenfassung der bisherigen Versuche

### 1. **Ursprüngliches Problem**
- **SIGSEGV/SIGBUS Crashes** beim Anki-Start
- Crashes traten auf, wenn `QApplication.setStyleSheet()` während der kritischen Startphase aufgerufen wurde
- Qt-Widgets waren noch nicht vollständig initialisiert

### 2. **Versuchte Lösungen (Chronologie)**

#### **Versuch 1: Startup-Delay mit Timer**
- `_MIN_STARTUP_DELAY = 8.0` Sekunden
- `is_startup_safe()` Funktion prüfte, ob genug Zeit vergangen war
- **Problem**: Timer selbst konnten während Startphase Crashes verursachen

#### **Versuch 2: Validierungs-Checks**
- `is_qapplication_valid()` - Prüft QApplication-Status
- `is_main_window_valid()` - Prüft MainWindow-Status
- `app.closingDown()` Check
- Widget-Count Validierung
- **Problem**: Checks halfen, aber Timing-Problem blieb

#### **Versuch 3: Hook-basierte Initialisierung (AKTUELL)**
- **Entfernt**: `_MIN_STARTUP_DELAY`, `is_startup_safe()`, `delayed_init()`
- **Verwendet**: `gui_hooks.state_did_change` als sicherer Einstiegspunkt
- **Logik**: 
  - `setup_global_theme()` registriert nur Hooks (keine Timer!)
  - `on_state_change()` wird beim ersten State-Change aufgerufen
  - Erst dann wird `apply_global_dark_theme()` aufgerufen
- **Vorteil**: Hook feuert nur, wenn Anki wirklich bereit ist

#### **Versuch 4: Kontinuierliches Restyling**
- Nach erfolgreicher Initialisierung: `start_continuous_restyle()`
- Verwendet `create_safe_timer()` (nur nach Initialisierung!)
- Alle 5 Sekunden wird Theme erneut angewendet
- **Problem**: Timer werden immer noch verwendet (wenn auch "sicher")

### 3. **Aktuelle Implementierung**

#### **Datei: `anki_global_theme.py`**

**Globale Variablen:**
- `_startup_time` - Startzeit für Debug-Logging
- `_app_running` - Flag ob App noch läuft
- `_app_initialized` - Flag ob App initialisiert ist
- `_theme_applied` - Flag ob Theme angewendet wurde
- `_continuous_restyle_timer` - Timer für kontinuierliches Restyling
- `_timers` - Liste aller Timer

**Hauptfunktionen:**
1. `setup_global_theme()` - Registriert Hooks (KEINE Timer!)
2. `on_state_change()` - Wird bei State-Change aufgerufen, initialisiert Theme
3. `apply_global_dark_theme()` - Wendet Stylesheet an
4. `start_continuous_restyle()` - Startet kontinuierliches Restyling (mit Timer)
5. `create_safe_timer()` - Erstellt Timer nur nach Initialisierung

**Debug-System:**
- `_write_debug_log()` - Schreibt NDJSON-Logs in `.cursor/debug.log`
- `_debug_log()` - Console-Logging mit Zeitstempel

## ⚠️ Aktuelle Probleme & Fehler

### **Problem 1: Timer werden immer noch verwendet**
**Ort**: `start_continuous_restyle()` → `create_safe_timer()`
- Auch wenn "sicher", werden Timer nach Initialisierung erstellt
- Könnte bei schnellen State-Changes Probleme verursachen

### **Problem 2: Komplexe Flag-Logik**
**Ort**: `on_state_change()`, `apply_global_dark_theme()`
- Mehrere Flags (`_app_running`, `_app_initialized`, `_theme_applied`)
- Race Conditions möglich bei schnellen State-Changes

### **Problem 3: Debug-Logs zeigen alte Logik**
**Ort**: `.cursor/debug.log`
- Logs zeigen noch `is_startup_safe()` Aufrufe
- Logs zeigen noch `delayed_init()` Aufrufe
- **Vermutung**: Alte Logs oder Code wurde nicht vollständig aktualisiert

### **Problem 4: Keine Fehler-Logs nach setStyleSheet()**
**Ort**: `apply_global_dark_theme()` Zeile 579-592
- Logs zeigen `pre_setStyleSheet` aber kein `post_setStyleSheet` oder `error`
- **Vermutung**: 
  - Entweder funktioniert es jetzt (gut!)
  - Oder Logs werden nicht geschrieben (schlecht!)

### **Problem 5: Kontinuierliches Restyling könnte überflüssig sein**
**Ort**: `start_continuous_restyle()`
- Theme wird alle 5 Sekunden erneut angewendet
- Könnte Performance-Probleme verursachen
- Könnte bei State-Changes zu Konflikten führen

## 🔍 Wo treten Fehler auf?

### **1. Beim Anki-Start**
- **Wahrscheinlichkeit**: Niedrig (Hook-basierte Initialisierung sollte sicher sein)
- **Symptom**: SIGSEGV/SIGBUS Crash
- **Ort**: `apply_global_dark_theme()` → `app.setStyleSheet()`

### **2. Bei State-Changes**
- **Wahrscheinlichkeit**: Mittel
- **Symptom**: Theme wird nicht angewendet oder teilweise angewendet
- **Ort**: `on_state_change()` → `apply_global_dark_theme()`

### **3. Beim kontinuierlichen Restyling**
- **Wahrscheinlichkeit**: Niedrig
- **Symptom**: Performance-Probleme, Widget-Flickering
- **Ort**: `continuous_restyle()` → `apply_global_dark_theme()`

### **4. Beim Schließen von Anki**
- **Wahrscheinlichkeit**: Niedrig
- **Symptom**: Cleanup-Fehler, Timer bleiben aktiv
- **Ort**: `cleanup_theme()` → `stop_all_timers()`

## 📊 Debug-Log Analyse

**Letzte Logs zeigen:**
1. ✅ `setup_global_theme:entry` - Theme Setup gestartet (0.0s)
2. ✅ `on_state_change` - State Change: deckBrowser → overview (5.01s)
3. ✅ `on_state_change:first_init` - Erste Initialisierung (5.01s)
4. ✅ `apply_global_dark_theme:entry` - Funktion betreten (5.02s)
5. ✅ `apply_global_dark_theme:pre_setStyleSheet` - Vor setStyleSheet (5.02s)
6. ❓ **KEIN** `post_setStyleSheet` oder `error` Log

**Interpretation:**
- Entweder: `setStyleSheet()` läuft erfolgreich durch (gut!)
- Oder: Logs werden nicht geschrieben (möglicher Bug im Logging)

## 🎯 Empfohlene nächste Schritte

### **1. Debug-Logging verbessern**
- Sicherstellen, dass `post_setStyleSheet` immer geschrieben wird
- Exception-Handling um `_write_debug_log()` verbessern

### **2. Timer komplett entfernen (optional)**
- `start_continuous_restyle()` entfernen oder deaktivieren
- Theme nur bei State-Changes anwenden (nicht kontinuierlich)

### **3. Flag-Logik vereinfachen**
- Reduziere auf 1-2 Flags statt 3
- Klarere State-Machine

### **4. Testen mit echten Crashes**
- Anki mehrmals starten und schließen
- Prüfe ob Crashes noch auftreten
- Prüfe Debug-Logs auf Fehler

### **5. Performance-Monitoring**
- Prüfe ob kontinuierliches Restyling Performance beeinträchtigt
- Prüfe ob State-Change-Handler zu langsam ist

## 📝 Code-Stellen die Aufmerksamkeit brauchen

1. **`anki_global_theme.py:579`** - `app.setStyleSheet()` Aufruf
2. **`anki_global_theme.py:856-857`** - Bedingung für `start_continuous_restyle()`
3. **`anki_global_theme.py:860-891`** - `start_continuous_restyle()` Funktion
4. **`anki_global_theme.py:124-164`** - `create_safe_timer()` Funktion
5. **`.cursor/debug.log`** - Debug-Logs analysieren

## ✅ Was funktioniert

1. ✅ Hook-Registrierung funktioniert
2. ✅ State-Change wird erkannt
3. ✅ Erste Initialisierung wird getriggert
4. ✅ Validierungs-Checks funktionieren
5. ✅ Debug-Logging schreibt (teilweise) Logs

## ❌ Was unklar ist

1. ❓ Ob `setStyleSheet()` erfolgreich ist (keine Logs)
2. ❓ Ob kontinuierliches Restyling nötig ist
3. ❓ Ob Timer noch Probleme verursachen
4. ❓ Ob alte Logs noch relevant sind
5. ❓ Ob Race Conditions bei State-Changes auftreten
