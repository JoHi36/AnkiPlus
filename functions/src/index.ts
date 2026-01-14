import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { validateToken } from './middleware/auth';
import { chatHandler } from './handlers/chat';
import { authHandler } from './handlers/auth';
import { modelsHandler } from './handlers/models';
import { quotaHandler } from './handlers/quota';

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: true, // Allow all origins for now (can be restricted later)
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.post('/api/chat', validateToken, chatHandler);
app.post('/api/auth/refresh', authHandler);
app.get('/api/models', modelsHandler);
app.get('/api/user/quota', validateToken, quotaHandler);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  functions.logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: {
      code: 'BACKEND_ERROR',
      message: 'An unexpected error occurred',
    },
  });
});

// Export Cloud Function
export const api = functions
  .region('europe-west1')
  .https.onRequest(app);
