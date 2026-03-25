/**
 * Chat request body
 */
export interface ChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'model' | 'function';
    content?: string;
    parts?: any[];  // Gemini-format parts (functionCall, functionResponse, text)
  }>;
  /** Legacy context field (backward compat) — mapped to cardContext internally */
  context?: {
    isQuestion?: boolean;
    question?: string;
    answer?: string;
    frontField?: string;
    stats?: {
      knowledgeScore?: number;
      reps?: number;
      lapses?: number;
      interval?: number;
    };
  };
  /** Agent identifier (default: 'tutor') */
  agent?: 'tutor' | 'research' | 'help' | 'plusi';
  /** Card context for system prompt injection */
  cardContext?: {
    question?: string;
    answer?: string;
    deckName?: string;
    tags?: string[];
    stats?: {
      knowledgeScore?: number;
      reps?: number;
      lapses?: number;
      interval?: number;
    };
    isQuestion?: boolean;
  };
  /** Per-card learning insights */
  insights?: string[];
  /** Response style preference */
  responseStyle?: 'compact' | 'detailed';
  /** Gemini-format tool definitions for agent loop */
  tools_definitions?: any[];
  mode?: 'compact' | 'detailed';
  model?: string;
  stream?: boolean; // Optional: if false, return complete response instead of streaming
  temperature?: number; // Optional: override temperature (0.0-2.0)
  maxOutputTokens?: number; // Optional: override max output tokens
  disableThinking?: boolean; // Optional: disable thinking for faster responses
}

/**
 * Auth refresh request body
 */
export interface AuthRefreshRequest {
  refreshToken: string;
}

/**
 * Auth refresh response
 */
export interface AuthRefreshResponse {
  idToken: string;
  expiresIn: number;
  refreshToken?: string; // New refresh token if provided by Firebase
}

/**
 * Models response
 */
export interface ModelsResponse {
  models: Array<{
    name: string;
    label: string;
  }>;
}

/**
 * Quota response
 */
export interface QuotaResponse {
  tier: 'free' | 'tier1' | 'tier2';
  tokens: {
    daily: { used: number; limit: number; remaining: number };
    weekly: { used: number; limit: number; remaining: number };
  };
  resetAt: {
    daily: string;
    weekly: string;
  };
}



