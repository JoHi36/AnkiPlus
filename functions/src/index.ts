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
import { createCheckoutSessionHandler, createPortalSessionHandler } from './handlers/stripe';
import { stripeWebhookHandler } from './handlers/stripeWebhook';
import { verifyCheckoutSessionHandler } from './handlers/verifyCheckoutSession';

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
      'https://anki-plus.vercel.app',
      'https://anki-plus-git-*.vercel.app', // Vercel preview deployments
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Check exact match
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      // Check Vercel preview deployments pattern
      if (origin.match(/^https:\/\/anki-plus.*\.vercel\.app$/)) {
        return callback(null, true);
      }

      // In development, allow all origins for easier testing
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // Default: allow for now (we can tighten this later)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Stripe Webhook Route - MUST be before express.json() because it needs raw body
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Parse JSON bodies (for all other routes)
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (ohne /api/ Präfix, da Cloud Function bereits "api" heißt)
app.post('/chat', validateToken, chatHandler);
app.post('/auth/refresh', authHandler);
app.get('/models', modelsHandler);
app.get('/user/quota', validateToken, quotaHandler);
app.get('/user/usage-history', validateToken, usageHistoryHandler);

// Stripe routes
app.post('/stripe/create-checkout-session', validateToken, createCheckoutSessionHandler);
app.post('/stripe/create-portal-session', validateToken, createPortalSessionHandler);
app.post('/stripe/verify-checkout-session', validateToken, verifyCheckoutSessionHandler);

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
