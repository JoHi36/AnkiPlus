/**
 * Chat request body
 */
export interface ChatRequest {
  message: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
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
  mode?: 'compact' | 'detailed';
  model?: string;
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
  flash: {
    used: number;
    limit: number; // -1 = unlimited
    remaining: number; // -1 = unlimited
  };
  deep: {
    used: number;
    limit: number;
    remaining: number;
  };
  resetAt: string; // ISO timestamp
}



