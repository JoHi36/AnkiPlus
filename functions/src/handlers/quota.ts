import { Request, Response } from 'express';
import { validateToken } from '../middleware/auth';
import { QuotaResponse } from '../types';
import {
  getOrCreateUser,
  getOrCreateDailyUsage,
  getCurrentDateString,
  getResetTime,
} from '../utils/firestore';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';

/**
 * GET /api/user/quota
 * Returns user quota status
 * Requires authentication
 */
export async function quotaHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();
  
  try {
    // Token validation is handled by middleware in index.ts
    // userId is attached to req by validateToken middleware
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    logger.info('Fetching quota', { userId });

    // Get user document
    const user = await getOrCreateUser(userId, (req as any).userEmail);
    
    // Get current date
    const currentDate = getCurrentDateString();
    
    // Get daily usage
    const dailyUsage = await getOrCreateDailyUsage(userId, currentDate);

    // Calculate limits based on tier
    let flashLimit = -1; // -1 = unlimited
    let deepLimit = 3; // Default for free tier

    switch (user.tier) {
      case 'free':
        flashLimit = -1; // Unlimited
        deepLimit = 3;
        break;
      case 'tier1':
        flashLimit = -1; // Unlimited
        deepLimit = 30; // Start with 30, can be adjusted
        break;
      case 'tier2':
        flashLimit = 500; // Safety limit
        deepLimit = 500; // Safety limit
        break;
    }

    // Calculate remaining
    const flashRemaining = flashLimit === -1 ? -1 : Math.max(0, flashLimit - dailyUsage.flashRequests);
    const deepRemaining = Math.max(0, deepLimit - dailyUsage.deepRequests);

    const response: QuotaResponse = {
      tier: user.tier,
      flash: {
        used: dailyUsage.flashRequests,
        limit: flashLimit,
        remaining: flashRemaining,
      },
      deep: {
        used: dailyUsage.deepRequests,
        limit: deepLimit,
        remaining: deepRemaining,
      },
      resetAt: getResetTime(),
    };

    logger.info('Quota retrieved', { userId, tier: user.tier });
    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching quota', error);
    res.status(500).json(createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to fetch quota', error.message));
  }
}

