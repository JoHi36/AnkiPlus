import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, getTierFromPriceId } from '../utils/stripe';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLogger } from '../utils/logging';
import * as functions from 'firebase-functions';

const db = getFirestore();
const logger = createLogger();

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events
 * NO authentication middleware - uses Stripe signature verification
 */
export async function stripeWebhookHandler(
  req: Request,
  res: Response
): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  
  // Get webhook secret from config
  const config = functions.config();
  const webhookSecret = config.stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not set');
    res.status(500).send('Webhook secret not configured');
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('Webhook signature verification failed', err);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    logger.info('Processing webhook event', { type: event.type, id: event.id });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('Error processing webhook', error, { eventType: event.type, eventId: event.id });
    res.status(500).send('Webhook processing failed');
  }
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.firebaseUserId;
  if (!userId) {
    logger.error('No firebaseUserId in session metadata', { sessionId: session.id });
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    logger.error('No subscription ID in session', { sessionId: session.id });
    return;
  }

  logger.info('Checkout completed', { userId, sessionId: session.id, subscriptionId });

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await updateUserSubscription(userId, subscription);
}

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);
  
  if (!user) {
    logger.error('User not found for Stripe customer', { customerId, subscriptionId: subscription.id });
    return;
  }

  logger.info('Subscription updated', { userId: user.id, subscriptionId: subscription.id, status: subscription.status });
  await updateUserSubscription(user.id, subscription);
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const user = await getUserByStripeCustomerId(customerId);
  
  if (!user) {
    logger.error('User not found for Stripe customer', { customerId, subscriptionId: subscription.id });
    return;
  }

  logger.info('Subscription deleted, downgrading to free', { userId: user.id, subscriptionId: subscription.id });

  // Downgrade to free tier
  await db.collection('users').doc(user.id).update({
    tier: 'free',
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: null,
    subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAtPeriodEnd: false,
  });
}

/**
 * Handle invoice.paid event (optional - for logging)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await getUserByStripeCustomerId(customerId);
  
  if (user) {
    logger.info('Invoice paid', { 
      userId: user.id, 
      invoiceId: invoice.id, 
      amount: invoice.amount_paid,
      currency: invoice.currency 
    });
  }
}

/**
 * Update user document with subscription information
 */
async function updateUserSubscription(userId: string, subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    logger.error('No price ID in subscription', { subscriptionId: subscription.id });
    return;
  }

  const tier = getTierFromPriceId(priceId);
  if (!tier) {
    logger.error('Unknown price ID', { priceId, subscriptionId: subscription.id });
    return;
  }

  const updateData: any = {
    tier,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  };

  await db.collection('users').doc(userId).update(updateData);

  logger.info('User subscription updated', { userId, tier, status: subscription.status });
}

/**
 * Find user by Stripe Customer ID
 */
async function getUserByStripeCustomerId(customerId: string): Promise<{ id: string; [key: string]: any } | null> {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error: any) {
    logger.error('Error finding user by Stripe customer ID', error, { customerId });
    return null;
  }
}

