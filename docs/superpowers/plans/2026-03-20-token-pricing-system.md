# Token-Based Pricing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace request-based quota with a unified, cost-normalized token system across all API endpoints.

**Architecture:** Backend tracks actual API cost in micro-dollars per request. Each model has a rate entry. Costs are normalized to display "Tokens" using Gemini 3.0 Flash output rate as the anchor ($3.00/1M). Firestore stores both raw cost and normalized tokens. Quota enforcement checks daily + weekly token budgets.

**Tech Stack:** Firebase Functions (TypeScript), Firestore, React (Landingpage + Anki frontend)

**Spec:** `docs/superpowers/specs/2026-03-20-token-pricing-system.md`

**Note:** The spec recommends `thinkingConfig: { thinkingBudget: 2048 }` to cap thinking tokens. This is **deferred** because the current v1beta Gemini API does not support `thinkingConfig` on `generateContent`. Will be added when the API supports it.

---

## File Structure

### Backend — New Files
- `functions/src/utils/tokenPricing.ts` — Model rate registry, normalization logic, tier limits
- `functions/src/utils/tokenQuota.ts` — Token-based quota check + debit (replaces old quota.ts logic)

### Backend — Modified Files
- `functions/src/utils/firestore.ts` — New interfaces + functions for token usage docs
- `functions/src/handlers/chat.ts` — Extract usageMetadata, debit tokens after stream
- `functions/src/handlers/router.ts` — Extract usageMetadata, debit tokens
- `functions/src/handlers/quota.ts` — Return token-based quota response
- `functions/src/handlers/usageHistory.ts` — Return token-based history
- `functions/src/types/index.ts` — Update QuotaResponse type

### Anki Addon Frontend — Modified Files
- `frontend/src/components/PaywallModal.jsx` — Remove hardcoded pricing, connect to token system
- `frontend/src/components/TokenBar.jsx` — NEW: Token usage bar for chat panel header
- `frontend/src/hooks/useAnki.js` — Parse new `[DONE]` event format with token info

### Landingpage Frontend — Modified Files
- `Landingpage/src/hooks/useQuota.ts` — New token-based QuotaData interface
- `Landingpage/src/hooks/useUnifiedQuota.ts` — Simplify (no more flash/deep merge)
- `Landingpage/src/hooks/useUsageHistory.ts` — Token-based history interface
- `Landingpage/src/components/TokenUsageBar.tsx` — Use token data instead of flash/deep
- `Landingpage/src/components/PricingGrid.tsx` — Show token amounts instead of "30x Deep Mode"
- `Landingpage/src/components/PricingComparisonTable.tsx` — Token-based feature comparison
- `Landingpage/src/components/PricingFAQ.tsx` — Update FAQ text
- `Landingpage/src/components/LimitExplanation.tsx` — Token-based limit messages

---

## Task 1: Token Pricing Utilities

**Files:**
- Create: `functions/src/utils/tokenPricing.ts`
- Test: `functions/src/utils/__tests__/tokenPricing.test.ts`

- [ ] **Step 1: Create test file with core normalization tests**

```typescript
// functions/src/utils/__tests__/tokenPricing.test.ts
import { calculateNormalizedTokens, getTokenLimits, MODEL_RATES, NORMALIZATION_RATE } from '../tokenPricing';

describe('tokenPricing', () => {
  describe('MODEL_RATES', () => {
    it('should have rates for gemini-3.0-flash', () => {
      expect(MODEL_RATES['gemini-3.0-flash']).toEqual({ input: 0.50, output: 3.00 });
    });
    it('should have rates for gemini-2.5-flash-lite', () => {
      expect(MODEL_RATES['gemini-2.5-flash-lite']).toEqual({ input: 0.10, output: 0.40 });
    });
  });

  describe('calculateNormalizedTokens', () => {
    it('should normalize Gemini 3.0 Flash output tokens 1:1', () => {
      // 1000 output tokens at $3.00/1M = $0.003
      // Normalized: $0.003 / ($3.00/1M) = 1000
      const result = calculateNormalizedTokens('gemini-3.0-flash', 0, 1000);
      expect(result).toBe(1000);
    });

    it('should normalize Gemini 3.0 Flash input tokens at lower rate', () => {
      // 1000 input tokens at $0.50/1M = $0.0005
      // Normalized: $0.0005 / ($3.00/1M) = ~167
      const result = calculateNormalizedTokens('gemini-3.0-flash', 1000, 0);
      expect(result).toBe(167);
    });

    it('should normalize Flash-Lite tokens much cheaper', () => {
      // 500 input ($0.10/1M) + 200 output ($0.40/1M)
      // Cost: (500*0.10 + 200*0.40) / 1M = $0.00013
      // Normalized: $0.00013 / ($3.00/1M) = ~43
      const result = calculateNormalizedTokens('gemini-2.5-flash-lite', 500, 200);
      expect(result).toBe(43);
    });

    it('should handle combined main + router request', () => {
      const router = calculateNormalizedTokens('gemini-2.5-flash-lite', 500, 200);
      const main = calculateNormalizedTokens('gemini-3.0-flash', 2000, 1500);
      // Router: ~43, Main: ~1833, Total: ~1876
      expect(router + main).toBeGreaterThan(1800);
      expect(router + main).toBeLessThan(2000);
    });

    it('should fall back to highest rate for unknown models', () => {
      const result = calculateNormalizedTokens('unknown-model', 1000, 1000);
      // Should use gemini-3.0-flash rates as fallback (most expensive)
      expect(result).toBeGreaterThan(0);
    });

    it('should return 0 for zero tokens', () => {
      expect(calculateNormalizedTokens('gemini-3.0-flash', 0, 0)).toBe(0);
    });
  });

  describe('getTokenLimits', () => {
    it('should return free tier limits', () => {
      const limits = getTokenLimits('free');
      expect(limits.daily).toBe(20000);
      expect(limits.weekly).toBe(100000);
    });
    it('should return tier1 limits', () => {
      const limits = getTokenLimits('tier1');
      expect(limits.daily).toBe(70000);
      expect(limits.weekly).toBe(350000);
    });
    it('should return tier2 limits', () => {
      const limits = getTokenLimits('tier2');
      expect(limits.daily).toBe(210000);
      expect(limits.weekly).toBe(1050000);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx jest src/utils/__tests__/tokenPricing.test.ts --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tokenPricing.ts**

```typescript
// functions/src/utils/tokenPricing.ts

/**
 * Model rate registry: cost per 1M tokens in USD
 * Add new models here as they become available.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gemini-3.0-flash':          { input: 0.50, output: 3.00 },
  'gemini-3-flash-preview':    { input: 0.50, output: 3.00 },  // Alias used in chat handler
  'gemini-2.5-flash':          { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':     { input: 0.10, output: 0.40 },
};

/**
 * Normalization anchor: 1 displayed "Token" costs this much per 1M.
 * Set to Gemini 3.0 Flash output rate so output tokens map 1:1.
 */
export const NORMALIZATION_RATE = 3.00; // USD per 1M normalized tokens

/** Fallback rates for unknown models (use most expensive to avoid undercharging) */
const FALLBACK_RATES = { input: 0.50, output: 3.00 };

/**
 * Calculate normalized display tokens from raw API token counts.
 * @param model - Model identifier (must match MODEL_RATES key)
 * @param inputTokens - Raw input token count from API
 * @param outputTokens - Raw output token count from API (including thinking)
 * @returns Normalized token count for display/quota
 */
export function calculateNormalizedTokens(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (inputTokens === 0 && outputTokens === 0) return 0;

  const rates = MODEL_RATES[model] || FALLBACK_RATES;
  const actualCostMicro = (inputTokens * rates.input + outputTokens * rates.output); // per 1M scale
  const normalizedTokens = Math.ceil(actualCostMicro / NORMALIZATION_RATE);
  return normalizedTokens;
}

/**
 * Calculate actual cost in micro-dollars ($0.000001) from raw token counts.
 * @returns Cost in micro-dollars
 */
export function calculateCostMicrodollars(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_RATES[model] || FALLBACK_RATES;
  // rates are per 1M tokens, so: (tokens * rate_per_1M) / 1M * 1M_microdollars
  // Simplified: tokens * rate_per_1M / 1M * 1_000_000 = tokens * rate
  return Math.ceil(inputTokens * rates.input + outputTokens * rates.output);
}

/** Token limits per tier */
export interface TokenLimits {
  daily: number;   // Normalized tokens per day
  weekly: number;  // Normalized tokens per week
}

/**
 * Get token limits for a user tier.
 */
export function getTokenLimits(tier: 'free' | 'tier1' | 'tier2'): TokenLimits {
  switch (tier) {
    case 'free':
      return { daily: 20_000, weekly: 100_000 };
    case 'tier1':
      return { daily: 70_000, weekly: 350_000 };
    case 'tier2':
      return { daily: 210_000, weekly: 1_050_000 };
    default:
      return { daily: 20_000, weekly: 100_000 };
  }
}

/** Anonymous user token limit */
export const ANONYMOUS_TOKEN_LIMIT = 5_000; // per day, no weekly
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx jest src/utils/__tests__/tokenPricing.test.ts --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/utils/tokenPricing.ts functions/src/utils/__tests__/tokenPricing.test.ts
git commit -m "feat: add token pricing utilities with model rates and normalization"
```

---

## Task 2: Token Quota Logic

**Files:**
- Create: `functions/src/utils/tokenQuota.ts`
- Modify: `functions/src/utils/firestore.ts` — add new interfaces and Firestore helpers
- Test: `functions/src/utils/__tests__/tokenQuota.test.ts`

- [ ] **Step 1: Add new interfaces to firestore.ts**

Add after existing `DailyUsageDocument` interface in `functions/src/utils/firestore.ts`:

```typescript
export interface TokenDailyUsage {
  tokensUsed: number;          // Normalized tokens consumed today
  inputTokens: number;         // Raw input tokens (analytics)
  outputTokens: number;        // Raw output tokens incl. thinking (analytics)
  requestCount: number;        // Total requests (analytics)
  costMicrodollars: number;    // Actual API cost in microdollars
  lastReset: Timestamp;
  // Legacy fields (kept for transition):
  flashRequests: number;
  deepRequests: number;
}

export interface TokenWeeklyUsage {
  tokensUsed: number;
  costMicrodollars: number;
  requestCount: number;
  weekStart: Timestamp;
}
```

- [ ] **Step 2: Add Firestore helper functions to firestore.ts**

Add these functions to `functions/src/utils/firestore.ts`:

```typescript
/**
 * Get current ISO 8601 week string (e.g., "2026-W12").
 * ISO weeks start on Monday; week 1 contains the first Thursday of the year.
 */
export function getCurrentWeekString(): string {
  const now = new Date();
  // Copy date, set to nearest Thursday (current date + 4 - current day number, Monday=1 Sunday=7)
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7; // Sunday = 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get or create token daily usage document
 */
export async function getOrCreateTokenDailyUsage(
  userId: string,
  date: string
): Promise<TokenDailyUsage> {
  const db = getDb();
  const ref = db.collection('usage').doc(userId).collection('daily').doc(date);
  const doc = await ref.get();

  if (doc.exists) {
    const data = doc.data()!;
    return {
      tokensUsed: data.tokensUsed || 0,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      requestCount: data.requestCount || 0,
      costMicrodollars: data.costMicrodollars || 0,
      lastReset: data.lastReset || Timestamp.now(),
      flashRequests: data.flashRequests || 0,
      deepRequests: data.deepRequests || 0,
    };
  }

  const newDoc: TokenDailyUsage = {
    tokensUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestCount: 0,
    costMicrodollars: 0,
    lastReset: Timestamp.now(),
    flashRequests: 0,
    deepRequests: 0,
  };
  await ref.set(newDoc);
  return newDoc;
}

/**
 * Get or create token weekly usage document
 */
export async function getOrCreateTokenWeeklyUsage(
  userId: string,
  week: string
): Promise<TokenWeeklyUsage> {
  const db = getDb();
  const ref = db.collection('usage').doc(userId).collection('weekly').doc(week);
  const doc = await ref.get();

  if (doc.exists) {
    const data = doc.data()!;
    return {
      tokensUsed: data.tokensUsed || 0,
      costMicrodollars: data.costMicrodollars || 0,
      requestCount: data.requestCount || 0,
      weekStart: data.weekStart || Timestamp.now(),
    };
  }

  const newDoc: TokenWeeklyUsage = {
    tokensUsed: 0,
    costMicrodollars: 0,
    requestCount: 0,
    weekStart: Timestamp.now(),
  };
  await ref.set(newDoc);
  return newDoc;
}

/**
 * Atomically debit tokens from daily + weekly usage docs.
 * Uses set() with merge:true + FieldValue.increment() to avoid race conditions.
 * No read-then-write — safe for concurrent requests.
 */
export async function debitTokens(
  userId: string,
  date: string,
  week: string,
  normalizedTokens: number,
  rawInputTokens: number,
  rawOutputTokens: number,
  costMicrodollars: number
): Promise<void> {
  const db = getDb();

  const dailyRef = db.collection('usage').doc(userId).collection('daily').doc(date);
  const weeklyRef = db.collection('usage').doc(userId).collection('weekly').doc(week);

  // Use set with merge + FieldValue.increment for atomic, race-free operation.
  // If doc doesn't exist yet, set() with merge creates it and increment starts from 0.
  const batch = db.batch();
  batch.set(dailyRef, {
    tokensUsed: FieldValue.increment(normalizedTokens),
    inputTokens: FieldValue.increment(rawInputTokens),
    outputTokens: FieldValue.increment(rawOutputTokens),
    requestCount: FieldValue.increment(1),
    costMicrodollars: FieldValue.increment(costMicrodollars),
    lastReset: Timestamp.now(),
  }, { merge: true });
  batch.set(weeklyRef, {
    tokensUsed: FieldValue.increment(normalizedTokens),
    costMicrodollars: FieldValue.increment(costMicrodollars),
    requestCount: FieldValue.increment(1),
    weekStart: Timestamp.now(),
  }, { merge: true });
  await batch.commit();
}
```

- [ ] **Step 3: Create tokenQuota.ts**

```typescript
// functions/src/utils/tokenQuota.ts
import { getUser, getOrCreateTokenDailyUsage, getOrCreateTokenWeeklyUsage, getCurrentDateString, getCurrentWeekString } from './firestore';
import { getTokenLimits, ANONYMOUS_TOKEN_LIMIT, TokenLimits } from './tokenPricing';
import { createLogger } from './logging';

const logger = createLogger();

export interface TokenQuotaResult {
  allowed: boolean;
  daily: { used: number; limit: number; remaining: number };
  weekly: { used: number; limit: number; remaining: number };
  tier: 'free' | 'tier1' | 'tier2';
}

/**
 * Check if user has token budget remaining (daily AND weekly).
 */
export async function checkTokenQuota(userId: string): Promise<TokenQuotaResult> {
  try {
    const user = await getUser(userId);
    const tier = user?.tier || 'free';
    const limits = getTokenLimits(tier);

    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    const [daily, weekly] = await Promise.all([
      getOrCreateTokenDailyUsage(userId, date),
      getOrCreateTokenWeeklyUsage(userId, week),
    ]);

    const dailyRemaining = Math.max(0, limits.daily - daily.tokensUsed);
    const weeklyRemaining = Math.max(0, limits.weekly - weekly.tokensUsed);
    const allowed = dailyRemaining > 0 && weeklyRemaining > 0;

    return {
      allowed,
      daily: { used: daily.tokensUsed, limit: limits.daily, remaining: dailyRemaining },
      weekly: { used: weekly.tokensUsed, limit: limits.weekly, remaining: weeklyRemaining },
      tier,
    };
  } catch (error: any) {
    logger.error('Error checking token quota', error, { userId });
    return {
      allowed: false,
      daily: { used: 0, limit: 0, remaining: 0 },
      weekly: { used: 0, limit: 0, remaining: 0 },
      tier: 'free',
    };
  }
}

/**
 * Check anonymous user token quota (daily only).
 */
export async function checkAnonymousTokenQuota(
  deviceId: string,
  ipAddress: string
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  try {
    const date = getCurrentDateString();
    const daily = await getOrCreateTokenDailyUsage(`anon_${deviceId}`, date);

    const remaining = Math.max(0, ANONYMOUS_TOKEN_LIMIT - daily.tokensUsed);
    return {
      allowed: remaining > 0,
      used: daily.tokensUsed,
      limit: ANONYMOUS_TOKEN_LIMIT,
      remaining,
    };
  } catch (error: any) {
    logger.error('Error checking anonymous token quota', error, { deviceId });
    return { allowed: false, used: 0, limit: ANONYMOUS_TOKEN_LIMIT, remaining: 0 };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx jest --no-cache`
Expected: PASS (new files compile, existing tests still pass)

- [ ] **Step 5: Commit**

```bash
git add functions/src/utils/tokenQuota.ts functions/src/utils/firestore.ts
git commit -m "feat: add token quota check and Firestore debit helpers"
```

---

## Task 3: Chat Handler — Token Extraction & Debit

**Files:**
- Modify: `functions/src/handlers/chat.ts`

This is the critical task. The chat handler must:
1. Use `checkTokenQuota` instead of `checkQuota`
2. Extract `usageMetadata` from the last Gemini streaming chunk
3. Call `debitTokens` after stream completes
4. Include token balance in `[DONE]` event

- [ ] **Step 1: Update imports in chat.ts**

Replace the old quota imports at the top of `functions/src/handlers/chat.ts`:

```typescript
// OLD:
import { checkQuota, incrementUsage, checkAnonymousQuota, incrementAnonymousUsage } from '../utils/quota';

// NEW:
import { checkTokenQuota, checkAnonymousTokenQuota } from '../utils/tokenQuota';
import { calculateNormalizedTokens, calculateCostMicrodollars } from '../utils/tokenPricing';
import { debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
```

- [ ] **Step 2: Replace quota check (lines ~55-101)**

Replace the quota check block with:

```typescript
    let tokenQuota;

    if (isAuthenticated && userId) {
      await getOrCreateUser(userId, (req as any).userEmail);
      tokenQuota = await checkTokenQuota(userId);
    } else if (anonymousId && ipAddress) {
      const anonQuota = await checkAnonymousTokenQuota(anonymousId, ipAddress);
      tokenQuota = {
        allowed: anonQuota.allowed,
        daily: { used: anonQuota.used, limit: anonQuota.limit, remaining: anonQuota.remaining },
        weekly: { used: 0, limit: 0, remaining: 0 },
        tier: 'free' as const,
      };
    } else {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid authentication state', undefined, requestId)
      );
      return;
    }

    if (!tokenQuota.allowed) {
      logger.warn('Token quota exceeded', { userId, anonymousId, tokenQuota });

      if (isAuthenticated && userId) {
        const user = await getOrCreateUser(userId, (req as any).userEmail);
        await logQuotaExceeded(userId, user.tier, 'tokens');
      }

      const upgradeUrl = process.env.UPGRADE_URL || functions.config().app?.upgrade_url || 'https://anki-plus.vercel.app/register';

      res.status(403).json(
        createErrorResponse(
          ErrorCode.QUOTA_EXCEEDED,
          isAuthenticated
            ? 'Token-Limit erreicht. Upgrade für mehr Tokens?'
            : 'Token-Limit erreicht. Kostenlos registrieren für mehr Tokens?',
          {
            daily: tokenQuota.daily,
            weekly: tokenQuota.weekly,
            upgradeUrl,
            requiresAuth: !isAuthenticated,
          },
          requestId
        )
      );
      return;
    }
```

- [ ] **Step 3: Remove old usage increment (lines ~383-395)**

Delete the block that calls `incrementUsage(userId, requestType)` and `incrementAnonymousUsage(...)` after the streaming response starts. Token debit now happens AFTER stream completes.

- [ ] **Step 4: Add usageMetadata extraction in streaming data handler**

In the `response.data.on('data', ...)` handler, add a variable to capture usageMetadata. Add before the `response.data.on('data', ...)` block:

```typescript
    // Token tracking
    let lastUsageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null = null;
```

Inside the JSON parsing section (after extracting text from candidates), add:

```typescript
                // Capture usageMetadata if present (usually in last chunk)
                if (jsonData.usageMetadata) {
                  lastUsageMetadata = jsonData.usageMetadata;
                  logger.debug('Captured usageMetadata', { usageMetadata: lastUsageMetadata });
                }
```

- [ ] **Step 5: Update [DONE] event and debit tokens in 'end' handler**

Replace the `response.data.on('end', ...)` handler with:

```typescript
    response.data.on('end', async () => {
      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          // Try to extract any remaining text and usageMetadata
          const jsonMatch = buffer.match(/\{[\s\S]*\}/g);
          if (jsonMatch) {
            for (const match of jsonMatch) {
              try {
                const jsonData = JSON.parse(match);
                if (jsonData.usageMetadata) {
                  lastUsageMetadata = jsonData.usageMetadata;
                }
                if (jsonData.candidates?.[0]?.content?.parts) {
                  for (const part of jsonData.candidates[0].content.parts) {
                    if (part.text) {
                      res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                    }
                  }
                }
              } catch { /* ignore parse errors */ }
            }
          }
        } catch { /* ignore */ }
      }

      // Debit tokens if we have usage metadata
      let tokenInfo = null;
      if (lastUsageMetadata) {
        const inputTokens = lastUsageMetadata.promptTokenCount || 0;
        const outputTokens = lastUsageMetadata.candidatesTokenCount || 0;
        const normalizedTokens = calculateNormalizedTokens(model, inputTokens, outputTokens);
        const costMicro = calculateCostMicrodollars(model, inputTokens, outputTokens);

        const effectiveUserId = isAuthenticated && userId ? userId : (anonymousId ? `anon_${anonymousId}` : null);

        if (effectiveUserId) {
          try {
            const date = getCurrentDateString();
            const week = getCurrentWeekString();
            await debitTokens(effectiveUserId, date, week, normalizedTokens, inputTokens, outputTokens, costMicro);

            // Calculate new remaining for client
            const dailyUsed = (tokenQuota.daily.used || 0) + normalizedTokens;
            const weeklyUsed = (tokenQuota.weekly.used || 0) + normalizedTokens;
            tokenInfo = {
              used: normalizedTokens,
              dailyRemaining: Math.max(0, tokenQuota.daily.limit - dailyUsed),
              weeklyRemaining: tokenQuota.weekly.limit > 0 ? Math.max(0, tokenQuota.weekly.limit - weeklyUsed) : undefined,
            };

            logger.info('Tokens debited', {
              userId: effectiveUserId,
              model,
              inputTokens,
              outputTokens,
              normalizedTokens,
              costMicro,
            });
          } catch (error) {
            logger.error('Failed to debit tokens', error as Error, { userId: effectiveUserId });
          }
        }
      } else {
        logger.warn('No usageMetadata in Gemini response', { userId, model });
      }

      // Send DONE event with token info
      const donePayload = tokenInfo
        ? JSON.stringify({ done: true, tokens: tokenInfo })
        : '[DONE]';
      res.write(`data: ${donePayload}\n\n`);
      res.end();
      logger.info('Chat request completed', { userId, textChunkCount, tokenInfo });
    });
```

- [ ] **Step 6: Update non-streaming path similarly**

In the non-streaming response block (the `if (!shouldStream)` section), add token extraction after getting the response:

```typescript
        // Extract usage metadata for token tracking
        const usageMetadata = result.usageMetadata;
        let tokenInfo = null;

        if (usageMetadata) {
          const inputTokens = usageMetadata.promptTokenCount || 0;
          const outputTokens = usageMetadata.candidatesTokenCount || 0;
          const normalizedTokens = calculateNormalizedTokens(model, inputTokens, outputTokens);
          const costMicro = calculateCostMicrodollars(model, inputTokens, outputTokens);

          const effectiveUserId = isAuthenticated && userId ? userId : (anonymousId ? `anon_${anonymousId}` : null);
          if (effectiveUserId) {
            const date = getCurrentDateString();
            const week = getCurrentWeekString();
            await debitTokens(effectiveUserId, date, week, normalizedTokens, inputTokens, outputTokens, costMicro);
            tokenInfo = { used: normalizedTokens };
          }
        }

        res.json({ text, tokens: tokenInfo });
```

Remove the old `incrementUsage` call in the non-streaming path.

- [ ] **Step 7: Verify build compiles**

Run: `cd functions && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/chat.ts
git commit -m "feat: extract usageMetadata from Gemini stream, debit normalized tokens"
```

---

## Task 4: Router Handler — Token Tracking

**Files:**
- Modify: `functions/src/handlers/router.ts`

The router uses Flash-Lite and currently doesn't track any usage. Add token debit.

- [ ] **Step 1: Add token tracking to router handler**

Add imports and token debit after the Gemini response:

```typescript
import { calculateNormalizedTokens, calculateCostMicrodollars } from '../utils/tokenPricing';
import { debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
```

After `const response = await geminiPost(...)` and before returning the JSON result, add:

```typescript
    // Debit tokens for router request
    const userId = (req as any).userId;
    if (userId) {
      const usageMetadata = response.data?.usageMetadata;
      if (usageMetadata) {
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        const normalizedTokens = calculateNormalizedTokens(ROUTER_MODEL, inputTokens, outputTokens);
        const costMicro = calculateCostMicrodollars(ROUTER_MODEL, inputTokens, outputTokens);
        const date = getCurrentDateString();
        const week = getCurrentWeekString();
        debitTokens(userId, date, week, normalizedTokens, inputTokens, outputTokens, costMicro)
          .catch(err => functions.logger.error('Failed to debit router tokens', err));
      }
    }
```

- [ ] **Step 2: Verify build**

Run: `cd functions && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add functions/src/handlers/router.ts
git commit -m "feat: add token tracking to router handler"
```

---

## Task 5: Quota & Usage History API — Token-Based Responses

**Files:**
- Modify: `functions/src/handlers/quota.ts`
- Modify: `functions/src/handlers/usageHistory.ts`
- Modify: `functions/src/types/index.ts`

- [ ] **Step 1: Update QuotaResponse type in types/index.ts**

Replace `QuotaResponse` interface:

```typescript
export interface QuotaResponse {
  tier: 'free' | 'tier1' | 'tier2';
  tokens: {
    daily: { used: number; limit: number; remaining: number };
    weekly: { used: number; limit: number; remaining: number };
  };
  resetAt: {
    daily: string;  // ISO timestamp
    weekly: string; // ISO timestamp
  };
  // Legacy fields (for transition — will be removed later)
  flash?: { used: number; limit: number; remaining: number };
  deep?: { used: number; limit: number; remaining: number };
}
```

- [ ] **Step 2: Rewrite quota handler**

Replace contents of `quotaHandler` in `functions/src/handlers/quota.ts`:

```typescript
import { Request, Response } from 'express';
import { QuotaResponse } from '../types';
import { getOrCreateUser, getOrCreateTokenDailyUsage, getOrCreateTokenWeeklyUsage, getCurrentDateString, getCurrentWeekString, getResetTime } from '../utils/firestore';
import { getTokenLimits } from '../utils/tokenPricing';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';

export async function quotaHandler(req: Request, res: Response): Promise<void> {
  const logger = createLogger();

  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    const user = await getOrCreateUser(userId, (req as any).userEmail);
    const limits = getTokenLimits(user.tier);

    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    const [daily, weekly] = await Promise.all([
      getOrCreateTokenDailyUsage(userId, date),
      getOrCreateTokenWeeklyUsage(userId, week),
    ]);

    // Calculate weekly reset (next Monday 00:00 UTC)
    const now = new Date();
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    const response: QuotaResponse = {
      tier: user.tier,
      tokens: {
        daily: {
          used: daily.tokensUsed,
          limit: limits.daily,
          remaining: Math.max(0, limits.daily - daily.tokensUsed),
        },
        weekly: {
          used: weekly.tokensUsed,
          limit: limits.weekly,
          remaining: Math.max(0, limits.weekly - weekly.tokensUsed),
        },
      },
      resetAt: {
        daily: getResetTime(),
        weekly: nextMonday.toISOString(),
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching quota', error);
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to fetch quota', error.message));
  }
}
```

- [ ] **Step 3: Update usage history handler**

Update `usageHistoryHandler` in `functions/src/handlers/usageHistory.ts` to include token data:

In the `dailyUsage` mapping, change the return object:

```typescript
    const dailyUsage = dates.map((date, index) => {
      const doc = usageDocs[index];
      const data = doc.exists ? doc.data() : null;
      return {
        date,
        tokens: data?.tokensUsed || 0,
        requests: data?.requestCount || 0,
        // Legacy fields
        flash: data?.flashRequests || 0,
        deep: data?.deepRequests || 0,
      };
    }).reverse();

    const totalTokens = dailyUsage.reduce((sum, day) => sum + day.tokens, 0);
    const totalRequests = dailyUsage.reduce((sum, day) => sum + day.requests, 0);
```

Update the response object:

```typescript
    const response = {
      dailyUsage,
      totalTokens,
      totalRequests,
      streak,
      // Legacy
      totalFlash: dailyUsage.reduce((sum, day) => sum + day.flash, 0),
      totalDeep: dailyUsage.reduce((sum, day) => sum + day.deep, 0),
    };
```

- [ ] **Step 4: Verify build**

Run: `cd functions && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/quota.ts functions/src/handlers/usageHistory.ts functions/src/types/index.ts
git commit -m "feat: update quota and usage-history endpoints for token-based responses"
```

---

## Task 6: Landingpage — Token-Based Hooks

**Files:**
- Modify: `Landingpage/src/hooks/useQuota.ts`
- Modify: `Landingpage/src/hooks/useUnifiedQuota.ts`
- Modify: `Landingpage/src/hooks/useUsageHistory.ts`

- [ ] **Step 1: Update useQuota.ts**

Replace `QuotaData` interface and adapt to new API response:

```typescript
export interface QuotaData {
  tier: 'free' | 'tier1' | 'tier2';
  tokens: {
    daily: { used: number; limit: number; remaining: number };
    weekly: { used: number; limit: number; remaining: number };
  };
  resetAt: {
    daily: string;
    weekly: string;
  };
}
```

The `fetchQuota` function stays the same — it already does a `GET` and sets the response.

- [ ] **Step 2: Simplify useUnifiedQuota.ts**

Replace the entire file:

```typescript
import { useQuota, QuotaData } from './useQuota';

export interface UnifiedQuota {
  daily: { used: number; limit: number; remaining: number };
  weekly: { used: number; limit: number; remaining: number };
  tier: 'free' | 'tier1' | 'tier2';
  isOverDailyLimit: boolean;
  isOverWeeklyLimit: boolean;
}

export function useUnifiedQuota() {
  const { quota, loading, error, refetch } = useQuota();

  const unified: UnifiedQuota | null = quota?.tokens ? {
    daily: quota.tokens.daily,
    weekly: quota.tokens.weekly,
    tier: quota.tier,
    isOverDailyLimit: quota.tokens.daily.remaining <= 0,
    isOverWeeklyLimit: quota.tokens.weekly.remaining <= 0,
  } : null;

  return { quota: unified, loading, error, refetch };
}
```

- [ ] **Step 3: Update useUsageHistory.ts**

Update the `DailyUsage` interface:

```typescript
export interface DailyUsage {
  date: string;
  tokens: number;
  requests: number;
  // Legacy
  flash: number;
  deep: number;
}

export interface UsageHistoryData {
  dailyUsage: DailyUsage[];
  totalTokens: number;
  totalRequests: number;
  streak: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add Landingpage/src/hooks/useQuota.ts Landingpage/src/hooks/useUnifiedQuota.ts Landingpage/src/hooks/useUsageHistory.ts
git commit -m "feat: update landingpage hooks for token-based quota API"
```

---

## Task 7: Landingpage — Update UI Components

**Files:**
- Modify: `Landingpage/src/components/TokenUsageBar.tsx`
- Modify: `Landingpage/src/components/PricingGrid.tsx`
- Modify: `Landingpage/src/components/PricingComparisonTable.tsx`
- Modify: `Landingpage/src/components/PricingFAQ.tsx`
- Modify: `Landingpage/src/components/LimitExplanation.tsx`
- Modify: `Landingpage/src/pages/AccountPage.tsx`

- [ ] **Step 1: Update TokenUsageBar.tsx**

Replace to use `UnifiedQuota` with daily/weekly token data:

```typescript
import { UnifiedQuota } from '../hooks/useUnifiedQuota';
import { UsageHistoryData } from '../hooks/useUsageHistory';

interface TokenUsageBarProps {
  quota: UnifiedQuota;
  history: UsageHistoryData | null;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function TokenUsageBar({ quota, history }: TokenUsageBarProps) {
  const pct = quota.daily.limit > 0
    ? Math.min((quota.daily.used / quota.daily.limit) * 100, 100)
    : 0;

  const barColor = quota.isOverDailyLimit
    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
    : 'bg-gradient-to-r from-[#0a84ff] to-[#4facfe]';

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('de-DE');
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[13px] text-white/[0.5]">Token-Nutzung heute</span>
        <span className="text-[13px] text-white/[0.35] font-light">
          {quota.isOverDailyLimit ? (
            <span className="text-amber-400">Tageslimit erreicht</span>
          ) : (
            <><strong className="text-white/[0.8] font-semibold">{formatTokens(quota.daily.used)}</strong> / {formatTokens(quota.daily.limit)}</>
          )}
        </span>
      </div>

      <div className="h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-[11px] text-white/[0.2] font-light">Setzt sich täglich zurück</span>
        <span className="text-[11px] text-white/[0.2] font-light">{Math.round(pct)}% verbraucht</span>
      </div>

      {/* Weekly summary */}
      {quota.weekly.limit > 0 && (
        <div className="mt-3 flex justify-between text-[11px] text-white/[0.2] font-light">
          <span>Woche: {formatTokens(quota.weekly.used)} / {formatTokens(quota.weekly.limit)}</span>
          <span>{Math.round((quota.weekly.used / quota.weekly.limit) * 100)}%</span>
        </div>
      )}

      {history && <WeekChart history={history} limit={quota.daily.limit} />}
    </div>
  );
}

function WeekChart({ history, limit }: { history: UsageHistoryData; limit: number }) {
  const last7 = history.dailyUsage.slice(-7);
  while (last7.length < 7) last7.unshift({ date: '', tokens: 0, requests: 0, flash: 0, deep: 0 });

  const maxVal = limit || Math.max(...last7.map(d => d.tokens), 1);

  return (
    <div className="flex gap-[6px] mt-4">
      {last7.map((day, i) => {
        const pct = Math.min((day.tokens / maxVal) * 100, 100);
        return (
          <div key={i} className="flex-1 text-center">
            <div className="text-[10px] text-white/[0.2] font-light mb-1.5">{DAY_LABELS[i]}</div>
            <div className="h-8 rounded bg-white/[0.04] relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-[#0a84ff]/30 rounded"
                style={{ height: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Update PricingGrid.tsx**

Replace token amounts in the pricing cards. Key changes:

- Free: "0€" stays, features list: "20K Tokens / Tag"
- Student: "4,99€" stays, features: "70K Tokens / Tag"
- Exam Pro: "14,99€" stays, features: "210K Tokens / Tag"

Replace the feature lists in each card. Example for Free tier:

```tsx
        <ul className="space-y-3 mb-8 text-sm text-white/[0.55] flex-1">
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.18] mt-0.5 flex-shrink-0" />
            <span><strong className="text-white/80">20K</strong> Tokens / Tag</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.18] mt-0.5 flex-shrink-0" />
            <span>100K Tokens / Woche</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.18] mt-0.5 flex-shrink-0" />
            <span>Basis Support</span>
          </li>
        </ul>
```

Similar updates for Student (70K/Tag, 350K/Woche) and Exam Pro (210K/Tag, 1.05M/Woche).

- [ ] **Step 3: Update PricingComparisonTable.tsx**

Replace the `features` array with token-based entries:

```typescript
const features: Feature[] = [
  {
    name: 'Tägliches Token-Budget',
    description: 'Tokens pro Tag für alle KI-Funktionen',
    free: '20K',
    tier1: '70K',
    tier2: '210K',
    highlight: true,
  },
  {
    name: 'Wöchentliches Token-Budget',
    description: 'Flexibles Wochenlimit',
    free: '100K',
    tier1: '350K',
    tier2: '1.05M',
  },
  {
    name: 'Deep Search',
    description: 'Anzahl der durchsuchten Quellen',
    free: '8 Karten',
    tier1: '8 Karten',
    tier2: '25 Karten',
  },
  {
    name: 'Priorisierte Generierung',
    description: 'Schnellere Antwortzeiten',
    free: false,
    tier1: true,
    tier2: true,
  },
  {
    name: 'Werbefrei',
    free: false,
    tier1: true,
    tier2: true,
  },
  {
    name: '24/7 Priority Support',
    free: false,
    tier1: false,
    tier2: true,
  },
  {
    name: 'Analytics Dashboard',
    description: 'Detaillierte Nutzungsstatistiken',
    free: false,
    tier1: true,
    tier2: true,
  },
];
```

- [ ] **Step 4: Update PricingFAQ.tsx**

Replace FAQ items to reference tokens instead of Deep Mode limits:

```typescript
const faqItems: FAQItem[] = [
  {
    question: 'Was passiert, wenn ich mein Token-Limit erreiche?',
    answer: 'Wenn dein Tageslimit erreicht ist, kannst du am nächsten Tag weiter lernen (Reset um 00:00 UTC). Upgrade für ein höheres Budget.',
    category: 'limits',
  },
  {
    question: 'Kann ich meinen Plan jederzeit upgraden?',
    answer: 'Ja! Upgrades werden sofort aktiv. Die Differenz wird anteilig berechnet. Downgrades werden am Ende des Abrechnungszeitraums wirksam.',
    category: 'billing',
  },
  {
    question: 'Was sind Tokens?',
    answer: 'Tokens sind die Einheit, in der KI-Nutzung gemessen wird. Jede Frage und Antwort verbraucht Tokens. Ein typisches Frage-Antwort-Paar verbraucht ca. 1.500–3.000 Tokens.',
    category: 'features',
  },
  {
    question: 'Wie funktioniert das Wochenlimit?',
    answer: 'Das Wochenlimit ist 5x dein Tageslimit. Wenn du an einem Tag weniger nutzt, hast du an anderen Tagen mehr Spielraum. So kannst du flexibel lernen.',
    category: 'limits',
  },
  {
    question: 'Kann ich meinen Plan kündigen?',
    answer: 'Ja, jederzeit ohne Kündigungsfrist. Du behältst Zugriff bis zum Ende des bezahlten Zeitraums.',
    category: 'billing',
  },
  {
    question: 'Gibt es Studentenrabatte?',
    answer: 'Aktuell bieten wir keine zusätzlichen Studentenrabatte an. Der Student-Plan (4,99€) ist bereits für alle optimiert.',
    category: 'billing',
  },
];
```

- [ ] **Step 5: Update LimitExplanation.tsx**

Replace the component to use token-based messaging:

```typescript
export function LimitExplanation({ tier }: { tier: 'free' | 'tier1' | 'tier2' }) {
  if (tier === 'tier2') return null;

  const dailyLimit = tier === 'free' ? '20K' : '70K';
  const upgradeTier = tier === 'free' ? 'Student' : 'Exam Pro';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 p-4 rounded-lg border bg-teal-500/10 border-teal-500/20"
    >
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-teal-400">
          {dailyLimit} Tokens pro Tag. Upgrade auf {upgradeTier} für mehr.
        </p>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 6: Update AccountPage.tsx import**

The AccountPage uses `UnifiedQuota` which now has `daily`/`weekly` instead of `used`/`limit`. The `TokenUsageBar` component handles the new shape, so no changes needed in AccountPage itself.

- [ ] **Step 7: Verify Landingpage builds**

Run: `cd Landingpage && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add Landingpage/src/components/TokenUsageBar.tsx Landingpage/src/components/PricingGrid.tsx Landingpage/src/components/PricingComparisonTable.tsx Landingpage/src/components/PricingFAQ.tsx Landingpage/src/components/LimitExplanation.tsx
git commit -m "feat: update landingpage pricing UI to show token amounts"
```

---

## Task 8: Anki Addon PaywallModal Cleanup

**Files:**
- Modify: `frontend/src/components/PaywallModal.jsx`

- [ ] **Step 1: Remove hardcoded price and voucher code**

Replace the PaywallModal content. Remove the hardcoded "9,99€", the "BSP2026" voucher logic, and the "Jetzt upgraden" button that does nothing. Replace with:

- Show current token usage bar
- "Upgrade für mehr Tokens" message
- Button that opens landing page pricing: `window.open('https://anki-plus.vercel.app/#pricing', '_blank')`

```jsx
export default function PaywallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const handleUpgrade = () => {
    window.open('https://anki-plus.vercel.app/#pricing', '_blank');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-[#09090b]/90 backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-md mx-4 bg-[#09090b]/95 backdrop-blur-xl border border-[#0a84ff]/20 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-gray-400 hover:text-gray-300"
          >
            <X size={16} />
          </button>

          <div className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2 text-white tracking-tight">
              Token-Limit erreicht
            </h2>
            <p className="text-gray-400 text-sm mb-8">
              Dein tägliches Token-Budget ist aufgebraucht. Upgrade für mehr Tokens und lerne ohne Unterbrechung weiter.
            </p>

            <div className="space-y-3 mb-8 text-left">
              {[
                { tier: 'Student', tokens: '70K Tokens/Tag', price: '4,99€/Monat' },
                { tier: 'Exam Pro', tokens: '210K Tokens/Tag', price: '14,99€/Monat' },
              ].map(({ tier, tokens, price }) => (
                <div key={tier} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div>
                    <span className="text-sm font-medium text-white/80">{tier}</span>
                    <span className="text-xs text-white/30 ml-2">{tokens}</span>
                  </div>
                  <span className="text-xs text-white/40">{price}</span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={handleUpgrade}
              className="w-full py-3 px-6 rounded-lg bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-semibold text-sm transition-all"
            >
              Pläne vergleichen
            </motion.button>

            <p className="mt-4 text-xs text-gray-500">
              Dein Limit setzt sich täglich um 00:00 UTC zurück.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Update imports** (remove unused `useState`, `CheckCircle2`, `Gift`)

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PaywallModal.jsx
git commit -m "fix: replace hardcoded PaywallModal with token-based upgrade prompt"
```

---

## Task 9: Anki Frontend — Token Bar & SSE Parsing

**Files:**
- Create: `frontend/src/components/TokenBar.jsx`
- Modify: `frontend/src/hooks/useAnki.js` — Parse new `[DONE]` format
- Modify: `frontend/src/App.jsx` — Add TokenBar to chat panel header

The Anki addon's React frontend needs to:
1. Parse the new JSON `[DONE]` event (with token info) in addition to the old `[DONE]` string
2. Show a token usage bar in the chat panel

- [ ] **Step 1: Update SSE parsing in useAnki.js**

Find the streaming response handler where `[DONE]` is detected. Update to handle both formats:

```javascript
// Old format: data: [DONE]
// New format: data: {"done": true, "tokens": {"used": 1876, "dailyRemaining": 5574}}

if (data === '[DONE]') {
  // Legacy format — no token info
  onComplete();
} else {
  try {
    const parsed = JSON.parse(data);
    if (parsed.done) {
      if (parsed.tokens) {
        // Update token state
        setTokenInfo(parsed.tokens);
      }
      onComplete();
    } else if (parsed.text) {
      onChunk(parsed.text);
    }
  } catch {
    // Not JSON, treat as text chunk
    if (data.startsWith('{')) return; // Malformed JSON, skip
  }
}
```

- [ ] **Step 2: Create TokenBar.jsx**

```jsx
import React from 'react';

export default function TokenBar({ tokenInfo }) {
  if (!tokenInfo || !tokenInfo.dailyRemaining === undefined) return null;

  const dailyLimit = tokenInfo.dailyRemaining + (tokenInfo.used || 0);
  // We only know remaining, not total limit — estimate from remaining + last used
  // Better: fetch full quota on mount, then update incrementally
  const remaining = tokenInfo.dailyRemaining;

  const formatTokens = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString('de-DE');
  };

  return (
    <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] text-[var(--ds-text-tertiary)]">
      <div className="flex-1 h-1 rounded-full bg-[var(--ds-border-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--ds-accent)] transition-all duration-300"
          style={{ width: `${Math.max(0, 100 - (remaining / Math.max(dailyLimit, 1)) * 100)}%` }}
        />
      </div>
      <span>{formatTokens(remaining)} Tokens</span>
    </div>
  );
}
```

- [ ] **Step 3: Add TokenBar to App.jsx**

Import and render TokenBar below the chat header, passing `tokenInfo` state.

- [ ] **Step 4: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TokenBar.jsx frontend/src/hooks/useAnki.js frontend/src/App.jsx
git commit -m "feat: add token usage bar to Anki chat panel, parse new [DONE] event"
```

---

## Task 10: Stripe Branding Documentation

**Files:**
- Create: `docs/reference/STRIPE_BRANDING.md`

No code changes — this is a manual step. Document the Stripe Dashboard settings.

- [ ] **Step 1: Write branding guide**

```markdown
# Stripe Branding Configuration

Configure in Stripe Dashboard → Settings → Branding:

## Colors
- **Brand color / Accent:** #0A84FF
- **Background:** #0F0F0F

## Logo
- Upload ANKI+ logo (white text on transparent background)
- Used on Checkout page and receipts

## Checkout Page
- The hosted Stripe Checkout will automatically use these brand colors
- Custom domain (optional): `pay.ankiplus.de` — configure in Settings → Custom domains

## Customer Portal
- Settings → Billing → Customer Portal
- Enable: subscription cancellation, plan switching
- Return URL: https://anki-plus.vercel.app/dashboard/subscription
```

- [ ] **Step 2: Commit**

```bash
git add docs/reference/STRIPE_BRANDING.md
git commit -m "docs: add Stripe branding configuration guide"
```

---

## Task 11: Integration Test & Deploy Verification

- [ ] **Step 1: Build backend**

Run: `cd functions && npm run build`
Expected: No errors

- [ ] **Step 2: Build Landingpage**

Run: `cd Landingpage && npm run build`
Expected: No errors

- [ ] **Step 3: Build Anki frontend**

Run: `cd frontend && npm run build`
Expected: No errors

- [ ] **Step 4: Run all backend tests**

Run: `cd functions && npx jest --no-cache`
Expected: All pass

- [ ] **Step 5: Manual verification checklist**

- [ ] Token normalization math is correct (cross-check with spec)
- [ ] Quota endpoint returns new `tokens` format
- [ ] Chat handler extracts `usageMetadata` from stream
- [ ] Router handler debits tokens
- [ ] Landingpage pricing shows token amounts (not "30x Deep Mode")
- [ ] PaywallModal opens landing page instead of showing voucher
- [ ] Old flash/deep fields still present in Firestore docs (backward compat)

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete token-based pricing system implementation"
```
