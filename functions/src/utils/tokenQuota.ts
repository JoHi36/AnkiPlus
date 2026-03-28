import {
  getUser,
  getOrCreateTokenDailyUsage,
  getOrCreateTokenWeeklyUsage,
  getCurrentDateString,
  getCurrentWeekString,
} from './firestore';
import { getTokenLimits, ANONYMOUS_TOKEN_LIMIT } from './tokenPricing';
import { createLogger } from './logging';

const logger = createLogger();

export interface TokenQuotaResult {
  allowed: boolean;
  daily: { used: number; limit: number; remaining: number };
  weekly: { used: number; limit: number; remaining: number };
  tier: 'free' | 'tier1' | 'tier2';
}

/**
 * Check whether an authenticated user has remaining token quota.
 * Returns quota status for both daily and weekly windows.
 *
 * @param skipDailyCheck - If true, only check weekly quota (used for background
 *   tasks like KG extraction that shouldn't consume the daily chat budget).
 */
export async function checkTokenQuota(userId: string, skipDailyCheck = false): Promise<TokenQuotaResult> {
  try {
    const user = await getUser(userId);
    const tier = user?.tier || 'free';
    const limits = getTokenLimits(tier);
    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    const [daily, weekly] = await Promise.all([
      getOrCreateTokenDailyUsage(userId, date),
      getOrCreateTokenWeeklyUsage(userId, week),
    ]);

    const dailyRemaining = Math.max(0, limits.daily - daily.tokensUsed);
    const weeklyRemaining = Math.max(0, limits.weekly - weekly.tokensUsed);
    const allowed = skipDailyCheck
      ? weeklyRemaining > 0
      : dailyRemaining > 0 && weeklyRemaining > 0;

    return {
      allowed,
      daily: { used: daily.tokensUsed, limit: limits.daily, remaining: dailyRemaining },
      weekly: { used: weekly.tokensUsed, limit: limits.weekly, remaining: weeklyRemaining },
      tier,
    };
  } catch (error: any) {
    logger.error('Error checking token quota', error, { userId });
    return {
      allowed: false,
      daily: { used: 0, limit: 0, remaining: 0 },
      weekly: { used: 0, limit: 0, remaining: 0 },
      tier: 'free',
    };
  }
}

/**
 * Check whether an anonymous user (identified by deviceId) has remaining token quota.
 * Anonymous users only have a daily limit, no weekly window.
 */
export async function checkAnonymousTokenQuota(
  deviceId: string,
  ipAddress: string
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  try {
    const date = getCurrentDateString();
    const daily = await getOrCreateTokenDailyUsage(`anon_${deviceId}`, date);
    const remaining = Math.max(0, ANONYMOUS_TOKEN_LIMIT - daily.tokensUsed);
    return { allowed: remaining > 0, used: daily.tokensUsed, limit: ANONYMOUS_TOKEN_LIMIT, remaining };
  } catch (error: any) {
    logger.error('Error checking anonymous token quota', error, { deviceId });
    return { allowed: false, used: 0, limit: ANONYMOUS_TOKEN_LIMIT, remaining: 0 };
  }
}
