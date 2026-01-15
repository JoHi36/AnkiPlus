import { Request, Response } from 'express';
import { stripe, getPriceIdFromTier, getFrontendUrl } from '../utils/stripe';
import { getOrCreateUser } from '../utils/firestore';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const logger = createLogger();

/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe Checkout Session for subscription upgrade
 * Requires authentication
 */
export async function createCheckoutSessionHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = (req as any).userId;
    const userEmail = (req as any).userEmail;
    
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    const { tier } = req.body;
    
    if (!tier || (tier !== 'tier1' && tier !== 'tier2')) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid tier. Must be tier1 or tier2'));
      return;
    }

    logger.info('Creating checkout session', { userId, tier });

    // Get or create user
    const user = await getOrCreateUser(userId, userEmail);
    
    // Get or create Stripe Customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          firebaseUserId: userId,
        },
      });
      customerId = customer.id;
      
      // Update user document with customer ID
      await db.collection('users').doc(userId).update({
        stripeCustomerId: customerId,
      });
      
      logger.info('Created Stripe customer', { userId, customerId });
    }

    // Get price ID for tier
    const priceId = getPriceIdFromTier(tier);
    const frontendUrl = getFrontendUrl();

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${frontendUrl}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/dashboard/subscription?canceled=true`,
      metadata: {
        firebaseUserId: userId,
        tier,
      },
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
          tier,
        },
      },
    });

    logger.info('Checkout session created', { userId, sessionId: session.id });

    res.json({ 
      sessionId: session.id, 
      url: session.url 
    });
  } catch (error: any) {
    logger.error('Error creating checkout session', error, { userId: (req as any).userId });
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to create checkout session', error.message));
  }
}

/**
 * POST /api/stripe/create-portal-session
 * Creates a Stripe Billing Portal Session for subscription management
 * Requires authentication
 */
export async function createPortalSessionHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = (req as any).userId;
    
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    logger.info('Creating portal session', { userId });

    // Get user
    const user = await getOrCreateUser(userId);
    
    if (!user.stripeCustomerId) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'No Stripe customer found. Please subscribe first.'));
      return;
    }

    const frontendUrl = getFrontendUrl();

    // Create Billing Portal Session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard/subscription`,
    });

    logger.info('Portal session created', { userId, sessionId: session.id });

    res.json({ url: session.url });
  } catch (error: any) {
    logger.error('Error creating portal session', error, { userId: (req as any).userId });
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to create portal session', error.message));
  }
}

