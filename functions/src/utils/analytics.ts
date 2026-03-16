/**
 * Analytics utility for Firebase Analytics Events
 * Logs important events for monitoring and debugging
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLogger } from './logging';

// Lazy initialization - get Firestore when needed (not at module load time)
let _db: ReturnType<typeof getFirestore> | null = null;
function getDb() {
  if (!_db) {
    _db = getFirestore();
  }
  return _db;
}

const logger = createLogger();

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  timestamp: Timestamp;
  properties?: Record<string, any>;
}

/**
 * Log analytics event to Firestore
 * @param event - Event name
 * @param userId - User ID (optional)
 * @param properties - Event properties (optional)
 */
export async function logAnalyticsEvent(
  event: string,
  userId?: string,
  properties?: Record<string, any>
): Promise<void> {
  try {
    const analyticsEvent: AnalyticsEvent = {
      event,
      userId,
      timestamp: Timestamp.now(),
      properties: properties || {},
    };

    // Log to Firestore collection
    const db = getDb();
    await db.collection('analytics').add(analyticsEvent);

    // Also log to console for debugging
    logger.info('Analytics event logged', { event, userId, properties });
  } catch (error) {
    // Don't fail the request if analytics logging fails
    logger.error('Failed to log analytics event', error, { event, userId });
  }
}

/**
 * Log authentication success
 */
export async function logAuthSuccess(userId: string, method: string = 'token'): Promise<void> {
  await logAnalyticsEvent('auth_success', userId, { method });
}

/**
 * Log authentication failure
 */
export async function logAuthFailed(reason: string, method: string = 'token'): Promise<void> {
  await logAnalyticsEvent('auth_failed', undefined, { reason, method });
}

/**
 * Log chat request
 */
export async function logChatRequest(
  userId: string,
  model: string,
  mode: string,
  messageLength: number
): Promise<void> {
  await logAnalyticsEvent('chat_request', userId, {
    model,
    mode,
    messageLength,
  });
}

/**
 * Log chat error
 */
export async function logChatError(
  userId: string,
  errorCode: string,
  errorMessage: string,
  tier?: string
): Promise<void> {
  await logAnalyticsEvent('chat_error', userId, {
    errorCode,
    errorMessage,
    tier,
  });
}

/**
 * Log quota exceeded
 */
export async function logQuotaExceeded(
  userId: string,
  tier: string,
  requestType: 'flash' | 'deep'
): Promise<void> {
  await logAnalyticsEvent('quota_exceeded', userId, {
    tier,
    requestType,
  });
}

/**
 * Log token refresh
 */
export async function logTokenRefresh(userId: string, success: boolean): Promise<void> {
  await logAnalyticsEvent('token_refresh', userId, { success });
}

/**
 * Log token refresh failure
 */
export async function logTokenRefreshFailed(userId: string, reason: string): Promise<void> {
  await logAnalyticsEvent('token_refresh_failed', userId, { reason });
}

