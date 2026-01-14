import { Request, Response } from 'express';
import { ModelsResponse } from '../types';

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
    const response: ModelsResponse = {
      models: [
        {
          name: 'gemini-3-flash-preview',
          label: 'Gemini 3 Flash',
        },
      ],
    };

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


