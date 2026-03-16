import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { createErrorResponse } from '../utils/errors';
import { logAuthSuccess, logAuthFailed } from '../utils/analytics';

/**
 * Validates Firebase ID Token from Authorization header
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function validateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        createErrorResponse('TOKEN_INVALID', 'Authorization header missing or invalid')
      );
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      res.status(401).json(
        createErrorResponse('TOKEN_INVALID', 'ID token missing')
      );
      return;
    }

    // Verify the ID token
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);

    // Attach user ID to request object for use in route handlers
    (req as any).userId = decodedToken.uid;
    (req as any).userEmail = decodedToken.email;

    // Log successful authentication
    await logAuthSuccess(decodedToken.uid, 'token');

    next();
  } catch (error: any) {
    // Handle token verification errors
    if (error.code === 'auth/id-token-expired') {
      await logAuthFailed('Token expired', 'token');
      res.status(401).json(
        createErrorResponse('TOKEN_EXPIRED', 'ID token has expired')
      );
      return;
    }

    if (error.code === 'auth/id-token-revoked') {
      await logAuthFailed('Token revoked', 'token');
      res.status(401).json(
        createErrorResponse('TOKEN_INVALID', 'ID token has been revoked')
      );
      return;
    }

    // Generic authentication error
    await logAuthFailed(error.message || 'Invalid token', 'token');
    res.status(401).json(
      createErrorResponse('TOKEN_INVALID', 'Invalid ID token')
    );
  }
}

/**
 * Validates Firebase ID Token optionally - allows anonymous users
 * If token is present and valid, sets userId
 * If no token, extracts deviceId and IP for anonymous tracking
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function validateTokenOptional(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // If authorization header is present, try to validate token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];

      if (idToken) {
        try {
          // Verify the ID token
          const auth = getAuth();
          const decodedToken = await auth.verifyIdToken(idToken);

          // Attach user ID to request object
          (req as any).userId = decodedToken.uid;
          (req as any).userEmail = decodedToken.email;
          (req as any).isAuthenticated = true;

          // Log successful authentication
          await logAuthSuccess(decodedToken.uid, 'token');

          next();
          return;
        } catch (error: any) {
          // Token invalid or expired - fall through to anonymous mode
          // Don't return error, allow anonymous access
        }
      }
    }

    // No valid token - set up anonymous tracking
    const deviceId = req.headers['x-device-id'] as string;
    const ipAddress = req.ip || 
                     req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                     req.headers['x-real-ip']?.toString() || 
                     'unknown';

    if (!deviceId) {
      res.status(400).json(
        createErrorResponse('VALIDATION_ERROR', 'Device ID required for anonymous access. Please include X-Device-Id header.')
      );
      return;
    }

    // Attach anonymous identifiers to request
    (req as any).anonymousId = deviceId;
    (req as any).ipAddress = ipAddress;
    (req as any).isAuthenticated = false;

    next();
  } catch (error: any) {
    // Fallback to anonymous mode on any error
    const deviceId = req.headers['x-device-id'] as string;
    const ipAddress = req.ip || 
                     req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                     req.headers['x-real-ip']?.toString() || 
                     'unknown';

    if (!deviceId) {
      res.status(400).json(
        createErrorResponse('VALIDATION_ERROR', 'Device ID required for anonymous access.')
      );
      return;
    }

    (req as any).anonymousId = deviceId;
    (req as any).ipAddress = ipAddress;
    (req as any).isAuthenticated = false;

    next();
  }
}

/**
 * Validates refresh token
 * @param refreshToken - Firebase refresh token
 * @returns User ID if token is valid
 * @throws Error if token is invalid
 */
export async function validateRefreshToken(
  refreshToken: string
): Promise<string> {
  try {
    getAuth();
    
    // Note: Firebase Admin SDK doesn't have a direct method to verify refresh tokens
    // We need to use the Firebase Auth REST API or handle this differently
    // For now, we'll validate by attempting to get user info
    // This is a simplified approach - in production, you might want to use
    // Firebase Auth REST API to verify refresh tokens
    
    // Alternative: Store refresh tokens in Firestore and validate against that
    // For MVP, we'll assume refresh tokens are valid if they're in the correct format
    // This should be enhanced in production
    
    // For now, return a placeholder - this will be implemented properly
    // when we integrate with the landing page auth flow
    throw new Error('Refresh token validation not yet implemented');
  } catch (error: any) {
    throw new Error(`Invalid refresh token: ${error.message}`);
  }
}


