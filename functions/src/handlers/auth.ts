import { Request, Response } from 'express';
import axios from 'axios';
import * as functions from 'firebase-functions';
import { AuthRefreshRequest, AuthRefreshResponse } from '../types';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { logTokenRefreshFailed } from '../utils/analytics';

/**
 * POST /api/auth/refresh
 * Refreshes Firebase ID Token using refresh token
 * 
 * Uses Firebase Auth REST API to exchange refresh token for new ID token.
 * This allows the plugin to maintain a persistent connection without
 * requiring the user to re-authenticate every time the token expires.
 */
export async function authHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    const body: AuthRefreshRequest = req.body;

    if (!body.refreshToken) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Refresh token is required')
      );
      return;
    }

    // Validate refresh token format
    if (typeof body.refreshToken !== 'string' || body.refreshToken.trim().length < 10) {
      await logTokenRefreshFailed('unknown', 'Invalid refresh token format');
      res.status(401).json(
        createErrorResponse(ErrorCode.TOKEN_INVALID, 'Invalid refresh token format')
      );
      return;
    }

    logger.info('Refreshing token via Firebase Auth REST API');

    // Get Firebase Web API Key from config
    const config = functions.config();
    const firebaseApiKey = config.firebase?.web_api_key || process.env.FIREBASE_WEB_API_KEY;

    if (!firebaseApiKey) {
      logger.error('FIREBASE_WEB_API_KEY not configured');
      await logTokenRefreshFailed('unknown', 'Firebase API key not configured');
      res.status(500).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'Firebase API key not configured')
      );
      return;
    }

    // Use Firebase Auth REST API to exchange refresh token for ID token
    // Endpoint: https://securetoken.googleapis.com/v1/token?key={API_KEY}
    const refreshUrl = `https://securetoken.googleapis.com/v1/token?key=${firebaseApiKey}`;

    try {
      const response = await axios.post(
        refreshUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: body.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      const { id_token, expires_in, refresh_token: newRefreshToken } = response.data;

      if (!id_token) {
        logger.error('No id_token in Firebase Auth response');
        await logTokenRefreshFailed('unknown', 'No id_token in response');
        res.status(500).json(
          createErrorResponse(ErrorCode.BACKEND_ERROR, 'Invalid response from Firebase Auth')
        );
        return;
      }

      logger.info('Token successfully refreshed', {
        expiresIn: expires_in,
        hasNewRefreshToken: !!newRefreshToken,
      });

      // Return new ID token and expiration
      const authResponse: AuthRefreshResponse = {
        idToken: id_token,
        expiresIn: parseInt(expires_in) || 3600, // Default to 1 hour if not provided
        refreshToken: newRefreshToken || body.refreshToken, // Use new refresh token if provided, otherwise keep old one
      };

      res.json(authResponse);
    } catch (axiosError: any) {
      // Handle Firebase Auth API errors
      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorData = axiosError.response.data;

        logger.error('Firebase Auth API error', {
          status,
          error: errorData?.error?.message || errorData,
        });

        if (status === 400) {
          // Invalid refresh token
          await logTokenRefreshFailed('unknown', 'Invalid refresh token');
          res.status(401).json(
            createErrorResponse(ErrorCode.TOKEN_INVALID, 'Invalid or expired refresh token')
          );
          return;
        }

        if (status === 403) {
          // API key invalid or quota exceeded
          await logTokenRefreshFailed('unknown', 'Firebase API key error');
          res.status(500).json(
            createErrorResponse(ErrorCode.BACKEND_ERROR, 'Firebase API key error')
          );
          return;
        }
      }

      // Network or other errors
      logger.error('Error calling Firebase Auth API', axiosError);
      await logTokenRefreshFailed('unknown', axiosError.message || 'Network error');
      res.status(500).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to refresh token', axiosError.message)
      );
    }
  } catch (error: any) {
    logger.error('Error refreshing token', error);
    await logTokenRefreshFailed('unknown', error.message || 'Unknown error');
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to refresh token', error.message)
    );
  }
}


