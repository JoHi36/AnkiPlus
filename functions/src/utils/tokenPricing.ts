/**
 * Model rate registry: cost per 1M tokens in USD.
 * Add new models here as they become available.
 */
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gemini-3.0-flash':          { input: 0.50, output: 3.00 },
  'gemini-3-flash-preview':    { input: 0.50, output: 3.00 },
  'gemini-2.5-flash':          { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':     { input: 0.10, output: 0.40 },
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
