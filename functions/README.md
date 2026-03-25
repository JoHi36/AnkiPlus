# AnkiPlus Cloud Functions

Firebase Cloud Functions backend for authentication, token management, and subscription handling.

## Endpoints

**POST /api/chat** — Proxied chat request to Google Gemini API with SSE streaming. Requires `Authorization: Bearer <firebase-id-token>`.

**POST /api/auth/refresh** — Refresh a Firebase ID token using a refresh token.

**GET /api/models** — List available models. No authentication required.

**GET /api/user/quota** — User quota status (tokens used, tier limits, reset time). Requires auth.

All endpoints return structured error responses with a `code`, `message`, `requestId`, and `timestamp`.

## Error Codes

`TOKEN_EXPIRED`, `TOKEN_INVALID`, `QUOTA_EXCEEDED`, `RATE_LIMIT_EXCEEDED`, `BACKEND_ERROR`, `GEMINI_API_ERROR`, `VALIDATION_ERROR`

## Setup

```bash
cd functions
npm install
firebase use ankiplus-b0ffb
firebase deploy --only functions
```

## Environment Variables

```bash
firebase functions:config:set google.ai_api_key="YOUR_GEMINI_API_KEY"
firebase functions:config:set app.upgrade_url="https://your-landingpage.com/register"
```

A Firebase service account key must be available via `GOOGLE_APPLICATION_CREDENTIALS` or Firebase config.
