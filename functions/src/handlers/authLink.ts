import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';

const COLLECTION = 'authLinks';
const TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /auth/link
 * Called by Landing Page after login to store tokens for a link code.
 * Body: { code: string, idToken: string, refreshToken: string }
 */
export async function authLinkStoreHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    const { code, idToken, refreshToken } = req.body;

    if (!code || typeof code !== 'string' || code.length < 16) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid link code')
      );
      return;
    }

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'idToken is required')
      );
      return;
    }

    const db = admin.firestore();
    await db.collection(COLLECTION).doc(code).set({
      idToken,
      refreshToken: refreshToken || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    logger.info('Auth link stored', { codePrefix: code.substring(0, 6) });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error storing auth link', error);
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to store auth link')
    );
  }
}

/**
 * GET /auth/link/:code
 * Called by Anki addon to poll for tokens.
 * Returns 404 if not yet available, 200 with tokens if ready.
 * Deletes the document after successful retrieval (one-time use).
 */
export async function authLinkRetrieveHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    const { code } = req.params;

    if (!code || typeof code !== 'string' || code.length < 16) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid link code')
      );
      return;
    }

    const db = admin.firestore();
    const docRef = db.collection(COLLECTION).doc(code);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({ pending: true });
      return;
    }

    const data = doc.data()!;

    // Check TTL
    const expiresAt = data.expiresAt?.toDate?.() || data.expiresAt;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      await docRef.delete();
      res.status(410).json(
        createErrorResponse(ErrorCode.TOKEN_EXPIRED, 'Link code expired')
      );
      return;
    }

    // Delete after retrieval (one-time use)
    await docRef.delete();

    logger.info('Auth link retrieved and deleted', { codePrefix: code.substring(0, 6) });
    res.json({
      idToken: data.idToken,
      refreshToken: data.refreshToken || '',
    });
  } catch (error: any) {
    logger.error('Error retrieving auth link', error);
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to retrieve auth link')
    );
  }
}
