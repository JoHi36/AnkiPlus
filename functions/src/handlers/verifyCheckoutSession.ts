import { Request, Response } from 'express';
import { stripe, getTierFromPriceId } from '../utils/stripe';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';

// Lazy initialization - get Firestore when needed
function getDb() {
  return getFirestore();
}

const logger = createLogger();

/**
 * POST /api/stripe/verify-checkout-session
 * Verifies a Stripe Checkout Session and updates user subscription
 * This is a fallback mechanism if webhook hasn't processed yet
 * Requires authentication
 */
export async function verifyCheckoutSessionHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = (req as any).userId;
    
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    const { sessionId } = req.body;
    
    if (!sessionId) {
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Session ID is required'));
      return;
    }

    logger.info('Verifying checkout session', { userId, sessionId });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Verify that this session belongs to the current user
    const sessionUserId = session.metadata?.firebaseUserId;
    if (sessionUserId !== userId) {
      logger.error('Session user mismatch', { 
        sessionUserId, 
        currentUserId: userId, 
        sessionId 
      });
      res.status(403).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'Session does not belong to current user'));
      return;
    }

    // Check if session is completed
    if (session.payment_status !== 'paid') {
      logger.warn('Session not paid', { sessionId, paymentStatus: session.payment_status });
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Session payment not completed'));
      return;
    }

    // Get subscription ID
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      logger.error('No subscription ID in session', { sessionId });
      res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, 'No subscription found in session'));
      return;
    }

    // Retrieve subscription details
    const subscription = typeof subscriptionId === 'string' 
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : subscriptionId;

    // Update user subscription
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      logger.error('No price ID in subscription', { subscriptionId: subscription.id });
      res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Invalid subscription data'));
      return;
    }

    const tier = getTierFromPriceId(priceId);
    if (!tier) {
      logger.error('Unknown price ID', { priceId, subscriptionId: subscription.id });
      res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Unknown subscription tier'));
      return;
    }

    const customerId = subscription.customer as string;
    
    const updateData: any = {
      tier,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    };

    const db = getDb();
    await db.collection('users').doc(userId).update(updateData);

    logger.info('User subscription updated via verify endpoint', { 
      userId, 
      tier, 
      status: subscription.status,
      customerId,
      subscriptionId: subscription.id 
    });

    res.json({ 
      success: true,
      tier,
      subscriptionStatus: subscription.status,
    });
  } catch (error: any) {
    logger.error('Error verifying checkout session', error, { userId: (req as any).userId });
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to verify checkout session', error.message));
  }
}

