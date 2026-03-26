/**
 * Model rate registry: cost per 1M tokens in USD.
 * Add new models here as they become available.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  // Internal model names (legacy, kept for backward compat)
  'gemini-3.0-flash':          { input: 0.50, output: 3.00 },
  'gemini-3-flash-preview':    { input: 0.50, output: 3.00 },
  'gemini-2.5-flash':          { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':     { input: 0.10, output: 0.40 },

  // OpenRouter model IDs
  'google/gemini-2.5-flash':      { input: 0.30, output: 2.50 },
  'google/gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'perplexity/sonar':             { input: 1.00, output: 1.00 },
};

/**
 * Normalization anchor: 1 displayed "Token" costs this much per 1M.
 * Set to Gemini 3.0 Flash output rate so output tokens map 1:1.
 */
export const NORMALIZATION_RATE = 3.00;

const FALLBACK_RATES = { input: 0.50, output: 3.00 };

/**
 * Calculate normalized display tokens from raw API token counts.
 */
export function calculateNormalizedTokens(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (inputTokens === 0 && outputTokens === 0) return 0;
  const rates = MODEL_RATES[model] || FALLBACK_RATES;
  const actualCostMicro = (inputTokens * rates.input + outputTokens * rates.output);
  return Math.ceil(actualCostMicro / NORMALIZATION_RATE);
}

/**
 * Calculate actual cost in micro-dollars from raw token counts.
 */
export function calculateCostMicrodollars(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = MODEL_RATES[model] || FALLBACK_RATES;
  return Math.ceil(inputTokens * rates.input + outputTokens * rates.output);
}

/**
 * Calculate normalized display tokens from actual USD cost (from OpenRouter).
 * This is the preferred method — no manual MODEL_RATES lookup needed.
 * Cost is in USD (e.g. 0.0042 = $0.0042).
 */
export function normalizeFromCost(costUsd: number): number {
  if (costUsd <= 0) return 0;
  // Convert USD cost to "per 1M tokens" equivalent, then normalize
  // costUsd is the real cost; NORMALIZATION_RATE is $/1M display tokens
  // displayTokens = costUsd / (NORMALIZATION_RATE / 1_000_000)
  return Math.ceil((costUsd * 1_000_000) / NORMALIZATION_RATE);
}

/**
 * Convert USD cost to microdollars (for storage).
 */
export function costToMicrodollars(costUsd: number): number {
  return Math.ceil(costUsd * 1_000_000);
}

export interface TokenLimits {
  daily: number;
  weekly: number;
}

export function getTokenLimits(tier: 'free' | 'tier1' | 'tier2'): TokenLimits {
  switch (tier) {
    case 'free':  return { daily: 20_000, weekly: 100_000 };
    case 'tier1': return { daily: 70_000, weekly: 350_000 };
    case 'tier2': return { daily: 210_000, weekly: 1_050_000 };
    default:      return { daily: 20_000, weekly: 100_000 };
  }
}

export const ANONYMOUS_TOKEN_LIMIT = 5_000;
