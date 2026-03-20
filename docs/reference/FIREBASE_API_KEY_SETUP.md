# Firebase Web API Key Setup

Für den Token-Refresh-Endpoint benötigen wir den **Firebase Web API Key** (nicht der Secret Key!).

## Wo finde ich den Firebase Web API Key?

1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt: **ankiplus-b0ffb**
3. Klicke auf das ⚙️ **Einstellungen** (Settings) Icon → **Projekteinstellungen**
4. Gehe zum Tab **Allgemein**
5. Scrolle runter zu **Deine Apps**
6. Falls noch keine Web-App vorhanden ist:
   - Klicke auf **</>** (Web-App hinzufügen)
   - Gib einen App-Namen ein (z.B. "AnkiPlus Web")
   - Klicke auf **App registrieren**
7. Unter **Firebase SDK-Snippet** → **Konfiguration** findest du:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // <-- Das ist der Web API Key!
     authDomain: "...",
     projectId: "...",
     // ...
   };
   ```
8. Kopiere den `apiKey` Wert

## API Key in Firebase Functions Config setzen

```bash
cd functions
firebase functions:config:set firebase.web_api_key="DEIN_API_KEY_HIER"
```

**Wichtig:** 
- Verwende den **Web API Key** (beginnt mit `AIza...`)
- NICHT den Secret Key (`sk_...`) oder Service Account Key

## Testen

Nach dem Deployment kannst du testen:

```bash
curl -X POST https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "DEIN_REFRESH_TOKEN"}'
```

## Sicherheit

Der Web API Key ist öffentlich und wird im Frontend verwendet. Das ist sicher, da:
- Firebase Auth die Requests validiert
- Der Key nur für Auth-Requests verwendet wird
- Domain-Restrictions können in Firebase Console gesetzt werden

