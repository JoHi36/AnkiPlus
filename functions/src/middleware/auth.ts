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


