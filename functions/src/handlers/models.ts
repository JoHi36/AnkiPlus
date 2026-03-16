import { Request, Response } from 'express';
import { ModelsResponse } from '../types';

// In-memory cache for model list
let modelListCache: ModelsResponse | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * GET /api/models
 * Returns list of available models
 * No authentication required
 */
export async function modelsHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Check cache
    const now = Date.now();
    if (modelListCache && (now - cacheTimestamp) < CACHE_DURATION) {
      res.json(modelListCache);
      return;
    }

    // Update cache
    const response: ModelsResponse = {
      models: [
        {
          name: 'gemini-3-flash-preview',
          label: 'Gemini 3 Flash',
        },
      ],
    };

    modelListCache = response;
    cacheTimestamp = now;

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: 'BACKEND_ERROR',
        message: 'Failed to retrieve models',
        details: error.message,
      },
    });
  }
}


