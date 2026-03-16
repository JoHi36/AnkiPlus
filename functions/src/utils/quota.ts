import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { 
  getUser, 
  getOrCreateDailyUsage, 
  getCurrentDateString,
  getOrCreateAnonymousUser,
  getAnonymousDailyUsage,
  resetAnonymousDailyUsage,
  incrementAnonymousFlashRequests,
  incrementAnonymousDeepRequests
} from './firestore';
import { createLogger } from './logging';

// Lazy initialization - get Firestore when needed
function getDb() {
  return getFirestore();
}

const logger = createLogger();

// Anonymous user limits
export const ANONYMOUS_FLASH_LIMIT = 20;
export const ANONYMOUS_DEEP_LIMIT = 0;

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  type: 'flash' | 'deep';
}

export interface QuotaLimits {
  flash: number; // -1 = unlimited
  deep: number;
}

/**
 * Get quota limits for a user tier
 * @param tier - User tier
 * @returns Quota limits object
 */
export function getQuotaLimits(tier: 'free' | 'tier1' | 'tier2'): QuotaLimits {
  switch (tier) {
    case 'free':
      return { flash: -1, deep: 3 };
    case 'tier1':
      return { flash: -1, deep: 30 };
    case 'tier2':
      return { flash: 500, deep: 500 }; // Safety limits
    default:
      // Default to free tier
      return { flash: -1, deep: 3 };
  }
}

/**
 * Check if user has quota remaining for a request
 * @param userId - Firebase Auth User ID
 * @param mode - Request mode ('compact' = flash, 'detailed' = deep)
 * @returns Quota check result
 */
export async function checkQuota(
  userId: string,
  mode: 'compact' | 'detailed' = 'compact'
): Promise<QuotaCheckResult> {
  try {
    // Get user document
    const user = await getUser(userId);
    if (!user) {
      logger.error('User not found', { userId });
      // Default to free tier if user doesn't exist
      const limits = getQuotaLimits('free');
      return {
        allowed: false,
        remaining: 0,
        limit: limits.deep,
        type: 'deep',
      };
    }

    // Determine request type
    const requestType: 'flash' | 'deep' = mode === 'detailed' ? 'deep' : 'flash';

    // Get quota limits for user tier
    const limits = getQuotaLimits(user.tier);

    // Get current date (UTC)
    const currentDate = getCurrentDateString();

    // Get or create daily usage
    const dailyUsage = await getOrCreateDailyUsage(userId, currentDate);

    // Check if reset is needed (lastReset date != current date)
    const lastResetDate = dailyUsage.lastReset.toDate();
    const lastResetDateString = `${lastResetDate.getUTCFullYear()}-${String(lastResetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lastResetDate.getUTCDate()).padStart(2, '0')}`;
    
    if (lastResetDateString !== currentDate) {
      // Reset needed - reset counters
      logger.info('Resetting daily usage', { userId, currentDate, lastResetDateString });
      await resetDailyUsage(userId, currentDate);
      
      // Get fresh usage after reset
      const resetUsage = await getOrCreateDailyUsage(userId, currentDate);
      
      // Check quota with reset usage
      return checkQuotaWithUsage(limits, resetUsage, requestType);
    }

    // Check quota with current usage
    return checkQuotaWithUsage(limits, dailyUsage, requestType);
  } catch (error: any) {
    logger.error('Error checking quota', error, { userId });
    // On error, deny request (fail-safe)
    return {
      allowed: false,
      remaining: 0,
      limit: 3,
      type: mode === 'detailed' ? 'deep' : 'flash',
    };
  }
}

/**
 * Check quota with usage data
 * @param limits - Quota limits
 * @param usage - Daily usage data
 * @param requestType - Request type ('flash' or 'deep')
 * @returns Quota check result
 */
function checkQuotaWithUsage(
  limits: QuotaLimits,
  usage: { flashRequests: number; deepRequests: number },
  requestType: 'flash' | 'deep'
): QuotaCheckResult {
  const limit = requestType === 'flash' ? limits.flash : limits.deep;
  const used = requestType === 'flash' ? usage.flashRequests : usage.deepRequests;

  // -1 means unlimited
  if (limit === -1) {
    return {
      allowed: true,
      remaining: -1,
      limit: -1,
      type: requestType,
    };
  }

  const remaining = Math.max(0, limit - used);
  const allowed = remaining > 0;

  return {
    allowed,
    remaining,
    limit,
    type: requestType,
  };
}

/**
 * Reset daily usage for a user
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 */
async function resetDailyUsage(userId: string, date: string): Promise<void> {
  const db = getDb();
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  await usageRef.set({
    flashRequests: 0,
    deepRequests: 0,
    lastReset: Timestamp.now(),
  });
}

/**
 * Check quota for anonymous user (device-based)
 * @param deviceId - Device ID from client
 * @param ipAddress - IP address of the client
 * @param mode - Request mode ('compact' = flash, 'detailed' = deep)
 * @returns Quota check result
 */
export async function checkAnonymousQuota(
  deviceId: string,
  ipAddress: string,
  mode: 'compact' | 'detailed' = 'compact'
): Promise<QuotaCheckResult> {
  try {
    // Determine request type
    const requestType: 'flash' | 'deep' = mode === 'detailed' ? 'deep' : 'flash';

    // Anonymous users can't use deep mode
    if (requestType === 'deep') {
      return {
        allowed: false,
        remaining: 0,
        limit: ANONYMOUS_DEEP_LIMIT,
        type: 'deep',
      };
    }

    // Get current date (UTC)
    const currentDate = getCurrentDateString();

    // Get or create anonymous user
    const anonymousUser = await getOrCreateAnonymousUser(deviceId, ipAddress);

    // Check if reset is needed
    const lastResetDate = anonymousUser.lastReset.toDate();
    const lastResetDateString = `${lastResetDate.getUTCFullYear()}-${String(lastResetDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lastResetDate.getUTCDate()).padStart(2, '0')}`;
    
    let usage = anonymousUser;
    
    if (lastResetDateString !== currentDate) {
      // Reset needed - reset counters
      logger.info('Resetting anonymous daily usage', { deviceId, currentDate, lastResetDateString });
      await resetAnonymousDailyUsage(deviceId, currentDate);
      
      // Get fresh usage after reset
      const freshUsage = await getAnonymousDailyUsage(deviceId, currentDate);
      if (freshUsage) {
        usage = freshUsage;
      }
    }

    // Check quota
    const limit = ANONYMOUS_FLASH_LIMIT;
    const used = usage.flashRequests;
    const remaining = Math.max(0, limit - used);
    const allowed = remaining > 0;

    return {
      allowed,
      remaining,
      limit,
      type: 'flash',
    };
  } catch (error: any) {
    logger.error('Error checking anonymous quota', error, { deviceId });
    // On error, deny request (fail-safe)
    return {
      allowed: false,
      remaining: 0,
      limit: ANONYMOUS_FLASH_LIMIT,
      type: 'flash',
    };
  }
}

/**
 * Increment usage counter atomically for anonymous user
 * @param deviceId - Device ID from client
 * @param ipAddress - IP address of the client
 * @param type - Request type ('flash' or 'deep')
 * @returns New count after increment
 */
export async function incrementAnonymousUsage(
  deviceId: string,
  ipAddress: string,
  type: 'flash' | 'deep'
): Promise<number> {
  try {
    const currentDate = getCurrentDateString();

    if (type === 'flash') {
      return await incrementAnonymousFlashRequests(deviceId, currentDate);
    } else {
      return await incrementAnonymousDeepRequests(deviceId, currentDate);
    }
  } catch (error: any) {
    logger.error('Error incrementing anonymous usage', error, { deviceId, type });
    throw error;
  }
}

/**
 * Increment usage counter atomically
 * @param userId - Firebase Auth User ID
 * @param type - Request type ('flash' or 'deep')
 * @returns New count after increment
 */
export async function incrementUsage(
  userId: string,
  type: 'flash' | 'deep'
): Promise<number> {
  try {
    const db = getDb();
    const currentDate = getCurrentDateString();
    const usageRef = db
      .collection('usage')
      .doc(userId)
      .collection('daily')
      .doc(currentDate);

    const fieldName = type === 'flash' ? 'flashRequests' : 'deepRequests';

    // Use Firestore transaction or set with merge for atomic increment
    // First, ensure document exists
    const usageDoc = await usageRef.get();
    
    if (!usageDoc.exists) {
      // Create document with initial values
      await usageRef.set({
        flashRequests: type === 'flash' ? 1 : 0,
        deepRequests: type === 'deep' ? 1 : 0,
        lastReset: Timestamp.now(),
      });
      return 1;
    }

    // Use FieldValue.increment for atomic operation
    await usageRef.update({
      [fieldName]: FieldValue.increment(1),
    });

    // Get updated count
    const updatedDoc = await usageRef.get();
    const data = updatedDoc.data();
    return (data?.[fieldName] || 0) as number;
  } catch (error: any) {
    logger.error('Error incrementing usage', error, { userId, type });
    throw error;
  }
}

