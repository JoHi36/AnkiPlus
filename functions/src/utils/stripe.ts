import Stripe from 'stripe';

// Lazy-initialized Stripe client — avoids crashing at module load when
// env vars aren't available yet (e.g., Firebase CLI analysis phase).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set. Please configure it as an environment variable.');
    }
    _stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  }
  return _stripe;
}

// Backward-compat: existing code imports `stripe` directly
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});

// Price IDs — read lazily from env
export function getStripePriceIds() {
  return {
    tier1: process.env.STRIPE_PRICE_TIER1 || '',
    tier2: process.env.STRIPE_PRICE_TIER2 || '',
  };
}

// Backward-compat export
export const STRIPE_PRICE_IDS = new Proxy({} as { tier1: string; tier2: string }, {
  get(_target, prop: string) {
    return getStripePriceIds()[prop as 'tier1' | 'tier2'];
  },
});

// Helper: Map Stripe subscription status to tier
export function getTierFromPriceId(priceId: string): 'tier1' | 'tier2' | null {
  if (priceId === STRIPE_PRICE_IDS.tier1) return 'tier1';
  if (priceId === STRIPE_PRICE_IDS.tier2) return 'tier2';
  return null;
}

// Helper: Map tier to Stripe price ID
export function getPriceIdFromTier(tier: 'tier1' | 'tier2'): string {
  if (tier === 'tier1') {
    if (!STRIPE_PRICE_IDS.tier1) {
      throw new Error('STRIPE_PRICE_TIER1 is not configured');
    }
    return STRIPE_PRICE_IDS.tier1;
  }
  if (tier === 'tier2') {
    if (!STRIPE_PRICE_IDS.tier2) {
      throw new Error('STRIPE_PRICE_TIER2 is not configured');
    }
    return STRIPE_PRICE_IDS.tier2;
  }
  throw new Error(`Invalid tier: ${tier}`);
}

// Get frontend URL from environment
export function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'https://anki-plus.vercel.app';
}

