/**
 * Error tracking utility for logging errors to Firestore
 * Used for monitoring and debugging production issues
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createLogger } from './logging';

// Lazy initialization - get Firestore when needed
function getDb() {
  return getFirestore();
}

const logger = createLogger();

export interface ErrorDocument {
  userId?: string;
  errorCode: string;
  message: string;
  stack?: string;
  timestamp: Timestamp;
  requestId?: string;
  context?: Record<string, any>;
  userAgent?: string;
  url?: string;
}

/**
 * Log error to Firestore for tracking
 * @param error - Error object or error message
 * @param userId - User ID (optional)
 * @param requestId - Request ID (optional)
 * @param context - Additional context (optional)
 */
export async function trackError(
  error: Error | string,
  userId?: string,
  requestId?: string,
  context?: Record<string, any>
): Promise<void> {
  try {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;
    const errorCode = typeof error === 'string' ? 'UNKNOWN' : (error as any).code || 'UNKNOWN';

    const errorDoc: ErrorDocument = {
      userId,
      errorCode,
      message: errorMessage,
      stack: errorStack,
      timestamp: Timestamp.now(),
      requestId,
      context: context || {},
    };

    // Log to Firestore collection
    const db = getDb();
    await db.collection('errors').add(errorDoc);

    // Also log to console for debugging
    logger.error('Error tracked', typeof error === 'string' ? new Error(error) : error, {
      userId,
      requestId,
      context,
    });
  } catch (trackingError) {
    // Don't fail the request if error tracking fails
    logger.error('Failed to track error', trackingError);
  }
}

/**
 * Track error from HTTP request
 * @param error - Error object
 * @param req - Express request object
 * @param userId - User ID (optional)
 * @param requestId - Request ID (optional)
 */
export async function trackHttpError(
  error: Error,
  req: any,
  userId?: string,
  requestId?: string
): Promise<void> {
  const context = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body ? JSON.stringify(req.body).substring(0, 500) : undefined, // Limit body size
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
  };

  await trackError(error, userId, requestId, context);
}

