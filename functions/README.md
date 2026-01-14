# Firebase Cloud Functions - Anki Chatbot Backend

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Environment Variables

#### For Local Development

Create a `.env` file in the `functions/` directory:

```bash
GOOGLE_AI_API_KEY=your_api_key_here
```

#### For Firebase Deployment

Set the environment variable using Firebase CLI:

```bash
firebase functions:config:set google.ai_api_key="YOUR_API_KEY"
```

Or use the newer environment variables approach (recommended):

```bash
firebase functions:secrets:set GOOGLE_AI_API_KEY
# Then enter your API key when prompted
```

Update `functions/src/handlers/chat.ts` to use secrets:

```typescript
const apiKey = process.env.GOOGLE_AI_API_KEY || 
               functions.config().google?.ai_api_key ||
               (await functions.secrets.get('GOOGLE_AI_API_KEY'));
```

### 3. Build

```bash
npm run build
```

### 4. Local Development

```bash
npm run serve
```

This will start the Firebase emulator with the functions.

### 5. Deploy

```bash
npm run deploy
```

Or from the project root:

```bash
firebase deploy --only functions
```

## API Endpoints

### POST /api/chat

Proxies chat requests to Google Gemini API with streaming support.

**Headers:**
- `Authorization: Bearer {firebaseIdToken}`

**Body:**
```json
{
  "message": "string",
  "history": [{"role": "user|assistant", "content": "string"}],
  "context": {
    "isQuestion": boolean,
    "question": "string",
    "answer": "string",
    "stats": {...}
  },
  "mode": "compact|detailed",
  "model": "gemini-3-flash-preview"
}
```

**Response:** Server-Sent Events (SSE) stream

### POST /api/auth/refresh

Refreshes Firebase ID Token.

**Body:**
```json
{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "idToken": "string",
  "expiresIn": 3600
}
```

### GET /api/models

Returns list of available models.

**Response:**
```json
{
  "models": [
    {"name": "gemini-3-flash-preview", "label": "Gemini 3 Flash"}
  ]
}
```

### GET /api/user/quota

Returns user quota status.

**Headers:**
- `Authorization: Bearer {firebaseIdToken}`

**Response:**
```json
{
  "tier": "free|tier1|tier2",
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

## Project Structure

```
functions/
├── src/
│   ├── index.ts              # Main entry, Express setup
│   ├── handlers/
│   │   ├── chat.ts          # POST /api/chat
│   │   ├── auth.ts          # POST /api/auth/refresh
│   │   ├── models.ts        # GET /api/models
│   │   └── quota.ts         # GET /api/user/quota
│   ├── middleware/
│   │   └── auth.ts          # Token validation
│   ├── utils/
│   │   ├── firestore.ts     # Firestore helpers
│   │   ├── errors.ts        # Error handling
│   │   └── logging.ts       # Logging helpers
│   └── types/
│       └── index.ts         # TypeScript types
├── package.json
├── tsconfig.json
└── .gitignore
```

## Firestore Structure

### users/{userId}

```typescript
{
  tier: "free" | "tier1" | "tier2",
  createdAt: Timestamp,
  email?: string
}
```

### usage/{userId}/daily/{YYYY-MM-DD}

```typescript
{
  flashRequests: number,
  deepRequests: number,
  lastReset: Timestamp
}
```

## Notes

- The backend uses Firebase Admin SDK for token validation
- Streaming responses use Server-Sent Events (SSE)
- Quota system will be fully implemented in Prompt 4
- Token refresh endpoint needs to be completed in Prompt 3 (Landingpage Integration)

