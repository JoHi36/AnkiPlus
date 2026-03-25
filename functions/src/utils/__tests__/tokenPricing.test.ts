import { calculateNormalizedTokens, getTokenLimits, MODEL_RATES, NORMALIZATION_RATE } from '../tokenPricing';

describe('tokenPricing', () => {
  describe('MODEL_RATES', () => {
    it('should have rates for gemini-3.0-flash', () => {
      expect(MODEL_RATES['gemini-3.0-flash']).toEqual({ input: 0.50, output: 3.00 });
    });
    it('should have rates for gemini-2.5-flash-lite', () => {
      expect(MODEL_RATES['gemini-2.5-flash-lite']).toEqual({ input: 0.10, output: 0.40 });
    });
    it('should use Gemini 3.0 Flash output rate as normalization anchor', () => {
      expect(NORMALIZATION_RATE).toBe(3.00);
    });
  });

  describe('calculateNormalizedTokens', () => {
    it('should normalize Gemini 3.0 Flash output tokens 1:1', () => {
      const result = calculateNormalizedTokens('gemini-3.0-flash', 0, 1000);
      expect(result).toBe(1000);
    });

    it('should normalize Gemini 3.0 Flash input tokens at lower rate', () => {
      const result = calculateNormalizedTokens('gemini-3.0-flash', 1000, 0);
      expect(result).toBe(167);
    });

    it('should normalize Flash-Lite tokens much cheaper', () => {
      const result = calculateNormalizedTokens('gemini-2.5-flash-lite', 500, 200);
      expect(result).toBe(44);
    });

    it('should handle combined main + router request', () => {
      const router = calculateNormalizedTokens('gemini-2.5-flash-lite', 500, 200);
      const main = calculateNormalizedTokens('gemini-3.0-flash', 2000, 1500);
      expect(router + main).toBeGreaterThan(1800);
      expect(router + main).toBeLessThan(2000);
    });

    it('should fall back to highest rate for unknown models', () => {
      const result = calculateNormalizedTokens('unknown-model', 1000, 1000);
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
