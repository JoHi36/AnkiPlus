/**
 * OpenRouter API Client with connection pooling
 * Single AI provider for all backend endpoints.
 * Reuses HTTP connections for better performance.
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import * as functions from 'firebase-functions';
import { retryWithBackoff, RetryOptions } from './retry';

// ---------------------------------------------------------------------------
// Model mapping: internal names → OpenRouter model IDs
// ---------------------------------------------------------------------------

export const MODEL_MAP: Record<string, string> = {
  'gemini-3-flash-preview': 'google/gemini-2.5-flash',
  'gemini-3.0-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
  'perplexity-sonar': 'perplexity/sonar',
};

/**
 * Resolve an internal model name to an OpenRouter model ID.
 * If the name is already a valid OpenRouter ID (contains '/'), it is returned as-is.
 * Throws if the name cannot be resolved.
 */
export function resolveModel(internalName: string): string {
  if (MODEL_MAP[internalName]) {
    return MODEL_MAP[internalName];
  }

  // Pass through names that look like OpenRouter IDs (provider/model)
  if (internalName.includes('/')) {
    return internalName;
  }

  throw new Error(`Unknown model: "${internalName}". Available: ${Object.keys(MODEL_MAP).join(', ')}`);
}

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface OpenRouterRequest {
  model: string; // Internal name or OpenRouter ID
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  response_format?: any;
}

export interface OpenRouterChoice {
  index: number;
  message: OpenRouterMessage;
  finish_reason: string | null;
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

// ---------------------------------------------------------------------------
// API key management
// ---------------------------------------------------------------------------

function getApiKey(): string {
  // Prefer environment variable (Cloud Run / emulator)
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // Fall back to Firebase runtime config
  try {
    const cfg = functions.config();
    if (cfg.openrouter?.api_key) {
      return cfg.openrouter.api_key;
    }
  } catch {
    // functions.config() may throw outside Firebase context
  }

  throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY env var or openrouter.api_key config.');
}

// ---------------------------------------------------------------------------
// Axios instance with connection pooling
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const openrouterClient: AxiosInstance = axios.create({
  baseURL: OPENROUTER_BASE_URL,
  httpsAgent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
  }),
  timeout: 60000, // 60 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Chat completion
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to OpenRouter.
 * Resolves the model name automatically.
 * When `req.stream` is true the response contains a Node.js readable stream
 * at `response.data` (caller is responsible for parsing SSE chunks).
 */
export async function chatCompletion(req: OpenRouterRequest): Promise<any> {
  const apiKey = getApiKey();
  const modelId = resolveModel(req.model);

  const body: any = {
    model: modelId,
    messages: req.messages,
  };

  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.stream !== undefined) body.stream = req.stream;
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice;
  if (req.response_format) body.response_format = req.response_format;

  const axiosConfig: any = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };

  // For streaming, get a raw Node stream instead of parsed JSON
  if (req.stream) {
    axiosConfig.responseType = 'stream';
  }

  const response = await openrouterClient.post('/chat/completions', body, axiosConfig);
  return response.data;
}

/**
 * Chat completion with automatic retry on transient errors.
 * Retries on 429 (rate limit), 500, 502, 503 with exponential backoff.
 */
export async function chatCompletionWithRetry(
  req: OpenRouterRequest,
  maxRetries?: number
): Promise<any> {
  const retryOpts: RetryOptions = {};
  if (maxRetries !== undefined) {
    retryOpts.maxRetries = maxRetries;
  }

  return retryWithBackoff(() => chatCompletion(req), retryOpts);
}
