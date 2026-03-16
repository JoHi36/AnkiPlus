# Firebase Cloud Functions - Anki Chatbot Backend

Backend für das Anki Chatbot Addon mit Firebase Cloud Functions.

## Setup

### Voraussetzungen

- Node.js 18+ und npm
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase-Projekt mit aktivierten Cloud Functions
- Service Account Key für Firebase Admin SDK

### Installation

1. Dependencies installieren:
```bash
cd functions
npm install
```

2. Firebase-Projekt konfigurieren:
```bash
firebase use ankiplus-b0ffb
```

3. Service Account Key einrichten:
   - Erstelle einen Service Account in der Firebase Console
   - Lade den JSON-Key herunter
   - Setze die Umgebungsvariable `GOOGLE_APPLICATION_CREDENTIALS` oder verwende `firebase functions:config:set`

4. Environment Variables setzen:
```bash
firebase functions:config:set google.ai_api_key="YOUR_GEMINI_API_KEY"
firebase functions:config:set app.upgrade_url="https://your-landingpage.com/register"
```

## Deployment

### Development

```bash
npm run serve
```

### Production

```bash
npm run deploy
```

Oder nur Functions deployen:
```bash
firebase deploy --only functions
```

## API Endpoints

### POST /api/chat
Proxied Chat-Request zu Google Gemini API mit Streaming-Support.

**Headers:**
- `Authorization: Bearer <firebase-id-token>`

**Body:**
```json
{
  "message": "User message",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "question": "Card question",
    "answer": "Card answer",
    "isQuestion": true,
    "stats": { ... }
  },
  "mode": "compact" | "detailed",
  "model": "gemini-3-flash-preview"
}
```

**Response:** Server-Sent Events (SSE) Stream

### POST /api/auth/refresh
Token-Refresh Endpoint (wird in Landingpage-Integration vollständig implementiert).

**Body:**
```json
{
  "refreshToken": "firebase-refresh-token"
}
```

### GET /api/models
Liste verfügbarer Modelle (keine Authentifizierung erforderlich).

**Response:**
```json
{
  "models": [
    {
      "name": "gemini-3-flash-preview",
      "label": "Gemini 3 Flash"
    }
  ]
}
```

### GET /api/user/quota
User Quota Status (Authentifizierung erforderlich).

**Headers:**
- `Authorization: Bearer <firebase-id-token>`

**Response:**
```json
{
  "tier": "free" | "tier1" | "tier2",
  "flash": {
    "used": 0,
    "limit": -1,
    "remaining": -1
  },
  "deep": {
    "used": 2,
    "limit": 3,
    "remaining": 1
  },
  "resetAt": "2024-01-02T00:00:00Z"
}
```

## Error Handling

Alle Endpoints verwenden strukturierte Error-Responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly error message",
    "details": { ... },
    "requestId": "req-...",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Error Codes

- `TOKEN_EXPIRED`: ID Token abgelaufen
- `TOKEN_INVALID`: Ungültiges Token
- `QUOTA_EXCEEDED`: Tageslimit erreicht
- `RATE_LIMIT_EXCEEDED`: Rate Limit überschritten
- `BACKEND_ERROR`: Allgemeiner Backend-Fehler
- `GEMINI_API_ERROR`: Gemini API Fehler
- `VALIDATION_ERROR`: Validierungsfehler

## Quota System

Das System implementiert tägliche Limits basierend auf User-Tiers:

- **Free Tier**: Unlimited Flash, 3x Deep/Tag
- **Tier1 (5€)**: Unlimited Flash, 30x Deep/Tag
- **Tier2 (15€)**: Unlimited Flash, Unlimited Deep (Safety: 500 Requests/Tag)

Quotas resetten täglich um Mitternacht UTC.

## Retry Logic

Das Backend implementiert Exponential Backoff für retryable Errors (429, 500, 502, 503):

- Max 3 Retries
- Initial Delay: 1s
- Max Delay: 8s
- Multiplier: 2x

## Monitoring & Analytics

Events werden in Firestore gespeichert:

- `analytics/`: Analytics Events (auth_success, chat_request, etc.)
- `errors/`: Error Tracking mit Context

## Security

- Token-basierte Authentifizierung für alle geschützten Endpoints
- Input-Validation und Sanitization
- CORS-Konfiguration für Production
- Sensitive Data wird in Logs sanitized

## Performance

- Connection Pooling für Gemini API Requests
- Caching für Model-Liste (1 Stunde)
- Atomic Operations für Usage Counters

## Development

### TypeScript Compilation

```bash
npm run build
```

### Linting

```bash
npm run lint
```

### Testing

Tests können mit Jest oder ähnlichen Frameworks hinzugefügt werden.

## Troubleshooting

### Functions deployen nicht

- Prüfe Firebase CLI Login: `firebase login`
- Prüfe Projekt: `firebase use`
- Prüfe Node.js Version: `node --version` (sollte 18+ sein)

### CORS Errors

- Prüfe `ALLOWED_ORIGINS` Environment Variable
- In Development werden alle Origins erlaubt

### Token Validation Errors

- Prüfe ob Firebase Admin SDK korrekt initialisiert ist
- Prüfe Service Account Key

## License

Proprietary - Anki Chatbot Addon
