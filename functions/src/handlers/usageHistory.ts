import { Request, Response } from 'express';
import { getOrCreateUser } from '../utils/firestore';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const logger = createLogger();

/**
 * GET /api/user/usage-history
 * Returns user usage history for the last 30 days
 * Requires authentication
 */
export async function usageHistoryHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Token validation is handled by middleware in index.ts
    // userId is attached to req by validateToken middleware
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    logger.info('Fetching usage history', { userId });

    // Get user document to verify user exists
    await getOrCreateUser(userId, (req as any).userEmail);
    
    // Calculate date range (last 30 days)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - i);
      const dateString = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      dates.push(dateString);
    }

    // Fetch usage data for all dates
    const usageRef = db
      .collection('usage')
      .doc(userId)
      .collection('daily');

    const usagePromises = dates.map(date => usageRef.doc(date).get());
    const usageDocs = await Promise.all(usagePromises);

    const dailyUsage = dates.map((date, index) => {
      const doc = usageDocs[index];
      const data = doc.exists ? doc.data() : null;
      return {
        date,
        flash: data?.flashRequests || 0,
        deep: data?.deepRequests || 0,
      };
    }).reverse(); // Reverse to get chronological order (oldest first)

    // Calculate totals
    const totalFlash = dailyUsage.reduce((sum, day) => sum + day.flash, 0);
    const totalDeep = dailyUsage.reduce((sum, day) => sum + day.deep, 0);

    // Calculate streak (consecutive days with any usage)
    let streak = 0;
    for (let i = dailyUsage.length - 1; i >= 0; i--) {
      if (dailyUsage[i].flash > 0 || dailyUsage[i].deep > 0) {
        streak++;
      } else {
        break;
      }
    }

    const response = {
      dailyUsage,
      totalFlash,
      totalDeep,
      streak,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching usage history', error, { userId: (req as any).userId });
    res.status(500).json(
      createErrorResponse(
        ErrorCode.BACKEND_ERROR,
        'Failed to fetch usage history',
        { error: error.message }
      )
    );
  }
}

