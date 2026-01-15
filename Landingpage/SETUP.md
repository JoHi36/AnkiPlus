# Landingpage Setup

## Firebase-Konfiguration

Die Landingpage benötigt Firebase-Konfigurationswerte aus Environment-Variablen.

### 1. Firebase-Konfiguration abrufen

1. Gehe zur [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt: **ankiplus-b0ffb**
3. Klicke auf das ⚙️ (Einstellungen) > **Projekteinstellungen**
4. Scrolle nach unten zu **Deine Apps** > **Web-App**
5. Falls noch keine Web-App existiert:
   - Klicke auf **</>** (Web-App hinzufügen)
   - Gib einen App-Namen ein (z.B. "ankiplus-landingpage")
   - Klicke auf **App registrieren**
6. Kopiere die Firebase-Konfigurationswerte (sie sehen so aus):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "ankiplus-b0ffb.firebaseapp.com",
  projectId: "ankiplus-b0ffb",
  storageBucket: "ankiplus-b0ffb.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 2. .env-Datei erstellen

Erstelle eine `.env`-Datei im `Landingpage/` Verzeichnis:

```bash
cd Landingpage
touch .env
```

Füge folgende Werte ein (ersetze die Platzhalter mit deinen echten Werten):

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSy... (dein API Key)
VITE_FIREBASE_AUTH_DOMAIN=ankiplus-b0ffb.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ankiplus-b0ffb
VITE_FIREBASE_STORAGE_BUCKET=ankiplus-b0ffb.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 (deine Sender ID)
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef (deine App ID)
```

### 3. Development Server starten

```bash
cd Landingpage
npm install
npm run dev
```

Die Landingpage sollte jetzt ohne `auth/invalid-api-key` Fehler laufen.

### 4. Für Production (Vercel/Netlify)

Für Production-Deployments musst du die Environment-Variablen in deinem Hosting-Service setzen:

**Vercel:**
1. Gehe zu deinem Projekt in Vercel
2. Settings > Environment Variables
3. Füge alle `VITE_FIREBASE_*` Variablen hinzu

**Netlify:**
1. Gehe zu deinem Projekt in Netlify
2. Site settings > Environment variables
3. Füge alle `VITE_FIREBASE_*` Variablen hinzu

### Troubleshooting

**Fehler: `auth/invalid-api-key`**
- Prüfe, ob die `.env`-Datei im `Landingpage/` Verzeichnis existiert
- Prüfe, ob alle Werte korrekt kopiert wurden (keine Anführungszeichen!)
- Starte den Dev-Server neu nach dem Erstellen der `.env`-Datei

**Fehler: `Firebase API Key is required`**
- Stelle sicher, dass die `.env`-Datei `VITE_FIREBASE_API_KEY` enthält
- Prüfe, dass die Datei `.env` heißt (nicht `.env.local` oder ähnlich)

**Wichtig:** Die `.env`-Datei ist in `.gitignore` und wird nicht ins Repository committed.


