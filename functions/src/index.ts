import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { validateToken } from './middleware/auth';
import { chatHandler } from './handlers/chat';
import { authHandler } from './handlers/auth';
import { modelsHandler } from './handlers/models';
import { quotaHandler } from './handlers/quota';
import { usageHistoryHandler } from './handlers/usageHistory';

// Initialize Firebase Admin
admin.initializeApp();

const app = express();

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      // Add production origins here
      // 'https://your-landingpage.com',
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // In development, allow all origins for easier testing
        if (process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
app.get('/api/user/usage-history', validateToken, usageHistoryHandler);

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
