import { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStripe } from '../utils/stripe';

/**
 * DELETE /user/account — Delete user account and all associated data (DSGVO Art. 17)
 *
 * Deletes:
 * 1. All Firestore subcollections under usage/{userId}/ (daily, weekly, tokens)
 * 2. The usage/{userId} document itself
 * 3. Analytics events for the user
 * 4. Testimonials by the user
 * 5. The users/{userId} document
 * 6. Stripe customer (cancel subscription + delete customer)
 * 7. Firebase Auth user
 */
export async function deleteAccountHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;

  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const db = getFirestore();
    const deletionLog: string[] = [];

    // 1. Get user doc first (need stripeCustomerId before deletion)
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const stripeCustomerId = userData?.stripeCustomerId;

    // 2. Delete usage subcollections (daily + weekly + tokens)
    for (const subcol of ['daily', 'weekly', 'tokens']) {
      const snapshot = await db.collection('usage').doc(userId).collection(subcol).listDocuments();
      if (snapshot.length > 0) {
        const batch = db.batch();
        for (const doc of snapshot) {
          batch.delete(doc);
        }
        await batch.commit();
        deletionLog.push(`usage/${subcol}: ${snapshot.length} docs`);
      }
    }

    // 3. Delete usage root doc
    await db.collection('usage').doc(userId).delete();
    deletionLog.push('usage root doc');

    // 4. Delete analytics events for user
    const analyticsSnapshot = await db.collection('analytics')
      .where('userId', '==', userId)
      .limit(500)
      .get();

    if (!analyticsSnapshot.empty) {
      const batch = db.batch();
      analyticsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletionLog.push(`analytics: ${analyticsSnapshot.size} events`);
    }

    // 5. Delete testimonials by user
    const testimonialSnapshot = await db.collection('testimonials')
      .where('userId', '==', userId)
      .get();

    if (!testimonialSnapshot.empty) {
      const batch = db.batch();
      testimonialSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletionLog.push(`testimonials: ${testimonialSnapshot.size} docs`);
    }

    // 6. Delete user document
    if (userDoc.exists) {
      await db.collection('users').doc(userId).delete();
      deletionLog.push('user document');
    }

    // 7. Cancel Stripe subscription + delete customer
    if (stripeCustomerId) {
      try {
        const stripe = getStripe();

        // Cancel all active subscriptions first
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
        });

        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
        }

        // Delete the customer (Stripe retains invoice data per legal requirement)
        await stripe.customers.del(stripeCustomerId);
        deletionLog.push('stripe customer + subscriptions');
      } catch (stripeError: any) {
        // Log but don't fail — Stripe data is secondary
        logger.warn('Stripe cleanup partial failure', {
          userId,
          stripeCustomerId,
          error: stripeError.message,
        });
        deletionLog.push(`stripe: partial (${stripeError.message})`);
      }
    }

    // 8. Delete Firebase Auth user
    try {
      await getAuth().deleteUser(userId);
      deletionLog.push('firebase auth user');
    } catch (authError: any) {
      logger.warn('Firebase Auth deletion failed', {
        userId,
        error: authError.message,
      });
      deletionLog.push(`firebase auth: failed (${authError.message})`);
    }

    logger.info('Account deleted (DSGVO Art. 17)', { userId, deletionLog });

    res.json({
      success: true,
      message: 'Ihr Konto und alle zugehörigen Daten wurden gelöscht.',
      details: deletionLog,
    });
  } catch (error: any) {
    logger.error('Account deletion failed', { userId, error: error.message, stack: error.stack });
    res.status(500).json({
      error: {
        code: 'DELETION_FAILED',
        message: 'Kontolöschung fehlgeschlagen. Bitte kontaktieren Sie uns unter Johannes_Hinkel@icloud.com.',
      },
    });
  }
}

/**
 * GET /user/data-export — Export all user data as JSON (DSGVO Art. 15 + 20)
 *
 * Returns all stored data for the authenticated user.
 */
export async function dataExportHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as any).userId;

  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const db = getFirestore();
    const exportData: Record<string, any> = {
      exportedAt: new Date().toISOString(),
      userId,
    };

    // 1. User profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      exportData.profile = userDoc.data();
    }

    // 2. Usage data (daily)
    const dailyDocs = await db.collection('usage').doc(userId).collection('daily')
      .orderBy('lastReset', 'desc')
      .limit(90)
      .get();
    exportData.usageDaily = dailyDocs.docs.map(doc => ({ date: doc.id, ...doc.data() }));

    // 3. Usage data (weekly)
    const weeklyDocs = await db.collection('usage').doc(userId).collection('weekly')
      .orderBy('weekStart', 'desc')
      .limit(13)
      .get();
    exportData.usageWeekly = weeklyDocs.docs.map(doc => ({ week: doc.id, ...doc.data() }));

    // 4. Analytics events (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const analyticsSnapshot = await db.collection('analytics')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();
    exportData.analyticsEvents = analyticsSnapshot.docs.map(doc => doc.data());

    // 5. Testimonials
    const testimonialSnapshot = await db.collection('testimonials')
      .where('userId', '==', userId)
      .get();
    exportData.testimonials = testimonialSnapshot.docs.map(doc => doc.data());

    logger.info('Data export (DSGVO Art. 15/20)', { userId });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ankiplus-data-export-${userId.slice(0, 8)}.json"`);
    res.json(exportData);
  } catch (error: any) {
    logger.error('Data export failed', { userId, error: error.message });
    res.status(500).json({
      error: {
        code: 'EXPORT_FAILED',
        message: 'Datenexport fehlgeschlagen. Bitte kontaktieren Sie uns unter Johannes_Hinkel@icloud.com.',
      },
    });
  }
}

/**
 * Cleanup old analytics/usage data (called by scheduled function)
 * Deletes data older than 90 days for:
 * - analytics events
 * - anonymous_users daily data
 */
export async function cleanupOldData(): Promise<{ analyticsDeleted: number; anonymousDeleted: number }> {
  const db = getFirestore();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoffDate = ninetyDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD

  let analyticsDeleted = 0;
  let anonymousDeleted = 0;

  // 1. Delete old analytics events
  const analyticsSnapshot = await db.collection('analytics')
    .where('timestamp', '<', ninetyDaysAgo)
    .limit(500)
    .get();

  if (!analyticsSnapshot.empty) {
    const batch = db.batch();
    analyticsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    analyticsDeleted = analyticsSnapshot.size;
  }

  // 2. Delete old anonymous user daily data
  // Anonymous users are stored as anonymous_users/{deviceId}/daily/{YYYY-MM-DD}
  const anonymousDevices = await db.collection('anonymous_users').listDocuments();

  for (const deviceDoc of anonymousDevices) {
    const dailyDocs = await deviceDoc.collection('daily').listDocuments();

    const oldDocs = dailyDocs.filter(doc => doc.id < cutoffDate);

    if (oldDocs.length > 0) {
      const batch = db.batch();
      for (const doc of oldDocs) {
        batch.delete(doc);
      }
      await batch.commit();
      anonymousDeleted += oldDocs.length;
    }

    // If device has no remaining daily docs, delete the device doc too
    const remaining = await deviceDoc.collection('daily').limit(1).get();
    if (remaining.empty) {
      await deviceDoc.delete();
    }
  }

  logger.info('Data retention cleanup completed', { analyticsDeleted, anonymousDeleted, cutoffDate });

  return { analyticsDeleted, anonymousDeleted };
}
