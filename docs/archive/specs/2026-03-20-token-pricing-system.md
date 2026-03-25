# Token-Based Pricing System — Design Spec

## Goal

Replace the current request-based quota system (flash/deep request counters) with a unified, cost-normalized token system. Users see "Tokens" as a single currency; the backend tracks actual API cost in micro-dollars and converts to normalized display tokens.

## Context & Motivation

- Current system counts requests (3 deep/day for free, 30 for tier1, 500 for tier2)
- No actual token tracking — a 500-token request costs the same as a 50,000-token request
- Multiple models with vastly different costs (Gemini 3.0 Flash vs 2.5 Flash-Lite router)
- Flash/Deep distinction is a legacy concept from the old UI — should be removed
- User needs a single, understandable metric: "Tokens used today"

## Core Concept: Normalized Tokens

### The Abstraction

**1 displayed "Token" = cost of 1 Gemini 3.0 Flash output token = $0.000003**

This normalization rate (`NORMALIZATION_RATE = 3.00` per 1M) is the anchor. All models are converted to this unit.

### Why Not Raw Tokens?

Different models have different costs per token. 1000 Flash-Lite tokens cost ~7.5x less than 1000 Gemini 3.0 Flash tokens. Showing raw tokens would be misleading — the user would see wildly different consumption depending on which model the system chose, even for similar questions.

### Why Not Show Money?

Users psychologically respond better to abstract units ("12,450 / 20,000 Tokens") than to money ("0.037€ / 0.060€ heute"). Tokens feel like a game resource; money feels like burning cash.

### Calculation

```
actualCost = (inputTokens * model.inputRate + outputTokens * model.outputRate) / 1_000_000
normalizedTokens = ceil(actualCost / (NORMALIZATION_RATE / 1_000_000))
```

Where `NORMALIZATION_RATE = 3.00` ($/1M — Gemini 3.0 Flash output rate).

### Model Rate Registry

```typescript
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gemini-3.0-flash':       { input: 0.50, output: 3.00 },
  'gemini-2.5-flash-lite':  { input: 0.10, output: 0.40 },
  // Future models added here
};
```

### Example Calculations

| Model | Input Tokens | Output Tokens | Actual Cost | Normalized Tokens |
|-------|-------------|---------------|-------------|-------------------|
| 3.0 Flash (main) | 2000 | 1500 | $0.0055 | ~1,833 |
| 2.5 Flash-Lite (router) | 500 | 200 | $0.00013 | ~43 |
| Combined request | — | — | $0.00563 | ~1,876 |

## Pricing Tiers

### Business Model

- Gemini 3.0 Flash blended cost: ~$2.00/1M tokens (40% input, 60% output)
- Target margin: 30% on API cost
- Effective user rate: ~$2.60/1M normalized tokens

### Tier Limits

| Tier | Price | API Budget/Month | Tokens/Month | Tokens/Day | Tokens/Week |
|------|-------|-----------------|--------------|------------|-------------|
| **Free** | 0€ | ~$0.50 (marketing) | ~250K | **20,000** | **100,000** |
| **Student** | 4.99€ | ~$4.15 | ~2.1M | **70,000** | **350,000** |
| **Exam Pro** | 14.99€ | ~$12.45 | ~6.2M | **210,000** | **1,050,000** |
| **Anonymous** | — | minimal | — | **5,000** | — |

### Limit Hierarchy

1. **Daily limit**: Hard cap per day, resets at 00:00 UTC
2. **Weekly limit**: 5x daily limit — allows flexibility (skip a day, catch up another)
3. No separate monthly limit (4 weeks × weekly = implicit monthly cap)

### Why Free Tier = 20K/Day

20,000 normalized tokens ≈ 4-6 full Deep requests with agent tooling. Enough for a real 30-min learning session. Generous enough to hook users, tight enough that power users upgrade.

## Quota Check Flow

### Before Request

```
1. Read user's daily + weekly usage from Firestore
2. Check: dailyTokensUsed < dailyLimit AND weeklyTokensUsed < weeklyLimit
3. If either exceeded → reject with 403 + remaining info
4. If OK → proceed with API call
```

No pre-estimation of token cost needed. We check "is there budget remaining?" not "is there enough for this specific request?"

### After Request (Streaming Complete)

```
1. Extract usageMetadata from last Gemini streaming chunk
   → { promptTokenCount, candidatesTokenCount, totalTokenCount }
2. Calculate normalizedTokens using MODEL_RATES
3. Atomically increment in Firestore:
   - daily doc: tokensUsed += normalizedTokens
   - weekly doc: tokensUsed += normalizedTokens
4. Include new balance in [DONE] SSE event to client
```

### Edge Case: Over-Limit After Response

If the last request pushes a user slightly over their daily limit, that's fine. The response completes normally. The next request will be blocked. This is intentional — we never cut off a response mid-stream.

### Thinking Token Budget Cap

To prevent runaway costs from unpredictable thinking tokens:

```typescript
generationConfig: {
  thinkingConfig: {
    thinkingBudget: 2048  // Cap thinking tokens per request
  }
}
```

This makes per-request cost more predictable without harming response quality.

## Firestore Schema Changes

### Daily Usage Document (`/usage/{userId}/daily/{YYYY-MM-DD}`)

**Before:**
```
{ flashRequests: number, deepRequests: number, lastReset: Timestamp }
```

**After:**
```
{
  tokensUsed: number,          // Normalized tokens consumed today
  inputTokens: number,         // Raw input tokens (for analytics)
  outputTokens: number,        // Raw output tokens incl. thinking (for analytics)
  requestCount: number,        // Total requests (for analytics)
  costMicrodollars: number,    // Actual API cost in $0.000001 (for internal tracking)
  lastReset: Timestamp,
  // Legacy fields kept during transition:
  flashRequests: number,
  deepRequests: number,
}
```

### Weekly Usage Document (`/usage/{userId}/weekly/{YYYY-Wxx}`) — NEW

```
{
  tokensUsed: number,          // Normalized tokens consumed this week
  costMicrodollars: number,    // Actual API cost
  requestCount: number,
  weekStart: Timestamp,        // Monday 00:00 UTC
}
```

### User Document (`/users/{userId}`) — NO CHANGES

Tier field already determines limits. No schema change needed.

## API Changes

### `GET /api/user/quota` — Response Format

**Before:**
```json
{
  "tier": "free",
  "flash": { "used": 5, "limit": -1, "remaining": -1 },
  "deep": { "used": 2, "limit": 3, "remaining": 1 },
  "resetAt": "2026-03-21T00:00:00Z"
}
```

**After:**
```json
{
  "tier": "free",
  "tokens": {
    "daily": { "used": 12450, "limit": 20000, "remaining": 7550 },
    "weekly": { "used": 45200, "limit": 100000, "remaining": 54800 }
  },
  "resetAt": {
    "daily": "2026-03-21T00:00:00Z",
    "weekly": "2026-03-24T00:00:00Z"
  }
}
```

### `POST /api/chat` — [DONE] Event Enhancement

Current `[DONE]` event at end of stream. Enhanced to include token info:

```
data: {"done": true, "tokens": {"used": 1876, "dailyRemaining": 5574, "weeklyRemaining": 52800}}
```

## Frontend Changes

### Anki Addon (React)

**Token Bar in Chat Panel:**
- Simple progress bar below chat header
- Shows: "12,450 / 20,000" with fill percentage
- Color: blue (normal) → amber (>80%) → red (>95%)
- Updates after each response via [DONE] event data

**Remove PaywallModal's hardcoded 9.99€ price and voucher code.** Replace with:
- Shows current tier + token usage
- "Upgrade" button → opens landing page pricing section in browser

### Landing Page (AccountPage)

**TokenUsageBar already exists** — update to use new token-based quota response instead of combined flash+deep counts.

**WeekChart already exists** — update data source to use weekly token data.

## Stripe Branding

Configure in Stripe Dashboard (Settings > Branding):
- Background color: `#0F0F0F`
- Accent/button color: `#0A84FF`
- Logo: ANKI+ logo (white on transparent)
- Font: default (Stripe's font is clean enough)

No code changes needed — purely dashboard configuration.

## Legacy Cleanup

### Remove Flash/Deep Distinction

The following code references flash/deep mode that should be unified:

- `functions/src/utils/quota.ts`: `getQuotaLimits()` returns separate flash/deep limits
- `functions/src/handlers/quota.ts`: Returns separate flash/deep quota objects
- `functions/src/handlers/chat.ts`: Mode-based quota check (`compact`/`detailed`)
- `Landingpage/src/hooks/useUnifiedQuota.ts`: Merges flash+deep into unified view
- `Landingpage/src/hooks/useQuota.ts`: Expects flash/deep structure
- `Landingpage/src/components/PricingComparisonTable.tsx`: Lists "3x Deep Mode / Tag" etc.
- `Landingpage/src/components/PricingGrid.tsx`: "30x Deep Mode" etc.
- `Landingpage/src/components/LimitExplanation.tsx`: Flash/Deep specific messages
- `Landingpage/src/components/PricingFAQ.tsx`: References daily Deep Mode limits
- `frontend/src/components/PaywallModal.jsx`: Hardcoded 9.99€, voucher "BSP2026"

### What "Remove" Means

- Backend: Keep legacy fields in Firestore docs (don't delete data) but stop incrementing them. New quota logic reads only `tokensUsed`.
- Frontend: Replace all "3x Deep Mode" / "30x Deep Mode" messaging with token amounts.
- PaywallModal: Remove hardcoded pricing, connect to real tier/token system.

## Migration Strategy

1. **Phase 1 (this implementation):** Add token tracking alongside existing request counting. Both systems run in parallel. Quota enforcement switches to tokens.
2. **Phase 2 (later):** Remove request-counting code once token system is validated.

This avoids a hard cutover and lets you compare token-based vs request-based data in analytics.

## Out of Scope

- Changing the actual price points (4.99€ / 14.99€) — keep as-is
- In-app Stripe checkout (keep landing page redirect)
- Usage-based billing (overage charges) — hard limits only
- Token purchase / top-up packs
- Per-model selection by user (backend chooses model)
