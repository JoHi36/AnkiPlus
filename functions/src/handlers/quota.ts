import { Request, Response } from 'express';
import { QuotaResponse } from '../types';
import {
  getOrCreateUser,
  getOrCreateTokenDailyUsage,
  getOrCreateTokenWeeklyUsage,
  getCurrentDateString,
  getCurrentWeekString,
  getResetTime,
} from '../utils/firestore';
import { getTokenLimits } from '../utils/tokenPricing';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';

/**
 * GET /api/user/quota
 * Returns user quota status (token-based)
 * Requires authentication
 */
export async function quotaHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    logger.info('Fetching quota', { userId });

    const user = await getOrCreateUser(userId, (req as any).userEmail);

    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    // Fetch daily + weekly usage in parallel
    const [dailyUsage, weeklyUsage] = await Promise.all([
      getOrCreateTokenDailyUsage(userId, date),
      getOrCreateTokenWeeklyUsage(userId, week),
    ]);

    const limits = getTokenLimits(user.tier);

    const dailyRemaining = Math.max(0, limits.daily - dailyUsage.tokensUsed);
    const weeklyRemaining = Math.max(0, limits.weekly - weeklyUsage.tokensUsed);

    // Calculate weekly reset: next Monday 00:00 UTC
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilMonday,
      0, 0, 0, 0
    ));

    const response: QuotaResponse = {
      tier: user.tier,
      tokens: {
        daily: {
          used: dailyUsage.tokensUsed,
          limit: limits.daily,
          remaining: dailyRemaining,
        },
        weekly: {
          used: weeklyUsage.tokensUsed,
          limit: limits.weekly,
          remaining: weeklyRemaining,
        },
      },
      resetAt: {
        daily: getResetTime(),
        weekly: nextMonday.toISOString(),
      },
    };

    logger.info('Quota retrieved', { userId, tier: user.tier });
    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching quota', error);
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to fetch quota', error.message));
  }
}
