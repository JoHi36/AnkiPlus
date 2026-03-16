import { Request, Response } from 'express';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { migrateAnonymousUsage } from '../utils/firestore';

/**
 * POST /api/migrate-anonymous
 * Migrates anonymous user usage to authenticated user account
 * Requires authentication
 */
export async function migrationHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    // Token validation is handled by middleware
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(
        createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found')
      );
      return;
    }

    const { deviceId } = req.body;

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Device ID is required')
      );
      return;
    }

    logger.info('Migrating anonymous usage', { userId, deviceId });

    // Migrate anonymous usage to user account
    const migrationResult = await migrateAnonymousUsage(deviceId, userId);

    logger.info('Anonymous usage migrated successfully', {
      userId,
      deviceId,
      flashRequests: migrationResult.flashRequests,
      deepRequests: migrationResult.deepRequests,
    });

    res.json({
      success: true,
      migrated: {
        flashRequests: migrationResult.flashRequests,
        deepRequests: migrationResult.deepRequests,
      },
    });
  } catch (error: any) {
    logger.error('Error migrating anonymous usage', error, {
      userId: (req as any).userId,
    });
    res.status(500).json(
      createErrorResponse(
        ErrorCode.BACKEND_ERROR,
        'Failed to migrate anonymous usage',
        error.message
      )
    );
  }
}

