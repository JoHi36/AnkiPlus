import Stripe from 'stripe';
import * as functions from 'firebase-functions';

// Get Stripe secret key from Firebase Functions config
const getStripeSecretKey = (): string => {
  const config = functions.config();
  const secretKey = config.stripe?.secret_key || process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set. Please configure it in Firebase Functions config.');
  }
  
  return secretKey;
};

// Initialize Stripe client
export const stripe = new Stripe(getStripeSecretKey(), {
  apiVersion: '2024-11-20.acacia',
});

// Get Price IDs from Firebase Functions config
const getPriceIds = () => {
  const config = functions.config();
  return {
    tier1: config.stripe?.price_tier1 || process.env.STRIPE_PRICE_TIER1 || '',
    tier2: config.stripe?.price_tier2 || process.env.STRIPE_PRICE_TIER2 || '',
  };
};

// Price IDs from Stripe Dashboard
export const STRIPE_PRICE_IDS = getPriceIds();

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

// Get frontend URL from config
export function getFrontendUrl(): string {
  const config = functions.config();
  return config.frontend?.url || process.env.FRONTEND_URL || 'https://anki-plus.vercel.app';
}

