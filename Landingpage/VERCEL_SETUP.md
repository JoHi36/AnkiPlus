# Vercel Environment Variables Setup

Die Landingpage läuft auf Vercel (anki-plus.vercel.app). Um Firebase Auth zu aktivieren, musst du die Environment-Variablen in Vercel setzen.

## Schritt-für-Schritt Anleitung

### 1. Firebase-Konfiguration abrufen

1. Gehe zur [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt: **ankiplus-b0ffb**
3. Klicke auf ⚙️ **Einstellungen** > **Projekteinstellungen**
4. Scrolle zu **Deine Apps** > **Web-App**
5. Falls keine Web-App existiert:
   - Klicke auf **</>** (Web-App hinzufügen)
   - App-Namen eingeben: "ankiplus-landingpage"
   - Klicke auf **App registrieren**
6. Kopiere die Firebase-Konfigurationswerte

### 2. Environment-Variablen in Vercel setzen

1. Gehe zu [Vercel Dashboard](https://vercel.com/dashboard)
2. Wähle dein Projekt: **anki-plus** (oder wie dein Projekt heißt)
3. Gehe zu **Settings** > **Environment Variables**
4. Füge folgende Variablen hinzu:

| Variable Name | Wert | Beispiel |
|--------------|------|----------|
| `VITE_FIREBASE_API_KEY` | Dein Firebase API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `ankiplus-b0ffb.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `ankiplus-b0ffb` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `ankiplus-b0ffb.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `1:123456789:web:abcdef` |

**Wichtig:**
- Setze die Variablen für **Production**, **Preview** und **Development**
- Keine Anführungszeichen um die Werte!
- Nach dem Setzen: **Redeploy** deine App (oder warte auf automatisches Redeploy)

### 3. App neu deployen

Nach dem Setzen der Environment-Variablen:

1. Gehe zu **Deployments** in Vercel
2. Klicke auf die drei Punkte (...) des neuesten Deployments
3. Wähle **Redeploy**
4. Oder pushe einen neuen Commit zu deinem Repository

### 4. Prüfen

Nach dem Redeploy sollte die Landingpage ohne "Firebase Auth is not configured" Fehler laufen.

## Troubleshooting

**Fehler bleibt bestehen:**
- Prüfe, ob alle 6 Environment-Variablen gesetzt sind
- Prüfe, ob die Werte korrekt sind (keine Leerzeichen, keine Anführungszeichen)
- Prüfe, ob die Variablen für **Production** gesetzt sind
- Warte 1-2 Minuten nach dem Redeploy

**Wie prüfe ich die Environment-Variablen?**
- In Vercel: Settings > Environment Variables
- Die Variablen sollten alle sichtbar sein (Werte sind aus Sicherheitsgründen versteckt)

**Lokale Entwicklung:**
- Für lokale Entwicklung: Erstelle eine `.env`-Datei im `Landingpage/` Verzeichnis
- Siehe `SETUP.md` für Details


