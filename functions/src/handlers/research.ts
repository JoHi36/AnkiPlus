import { Request, Response } from 'express';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getOrCreateUser, debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
import { checkTokenQuota } from '../utils/tokenQuota';
import { calculateNormalizedTokens, calculateCostMicrodollars, normalizeFromCost, costToMicrodollars } from '../utils/tokenPricing';
import { chatCompletionWithRetry, resolveModel, OpenRouterRequest, fetchGenerationCost } from '../utils/openrouter';

const DEFAULT_MODEL = 'perplexity-sonar';

const RESEARCH_SYSTEM_PROMPT =
  'You are a research tool for a learning app. ' +
  'Answer the question directly in 2-5 sentences. No introductions, no meta-commentary about yourself. ' +
  'Every factual claim must have a citation: [1], [2] etc. ' +
  'If no reliable source exists, say so explicitly. ' +
  'Answer in the same language as the question.';

/**
 * POST /research
 * Proxies research queries to Perplexity Sonar via OpenRouter.
 * Returns a concise answer with citations.
 * Requires authentication (validateToken middleware).
 */
export async function researchHandler(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createLogger(requestId);

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const userId = (req as any).userId as string;
    const userEmail = (req as any).userEmail as string | undefined;

    if (!userId) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'User ID required', undefined, requestId)
      );
      return;
    }

    // ── Validate body ────────────────────────────────────────────────
    const { query, model } = req.body as { query?: string; model?: string };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'query is required and must be a non-empty string', undefined, requestId)
      );
      return;
    }

    const selectedModel = model || DEFAULT_MODEL;

    logger.info('Research request received', { userId, model: selectedModel, queryLength: query.length });

    // ── Token quota check ────────────────────────────────────────────
    await getOrCreateUser(userId, userEmail);
    const tokenQuota = await checkTokenQuota(userId);

    if (!tokenQuota.allowed) {
      logger.warn('Token quota exceeded', { userId, tokenQuota });
      res.status(403).json(
        createErrorResponse(
          ErrorCode.QUOTA_EXCEEDED,
          'Token-Limit erreicht. Upgrade für mehr Tokens?',
          {
            daily: tokenQuota.daily,
            weekly: tokenQuota.weekly,
            tier: tokenQuota.tier,
          },
          requestId
        )
      );
      return;
    }

    // ── Build OpenRouter request ─────────────────────────────────────
    const resolvedModel = resolveModel(selectedModel);

    const openrouterReq: OpenRouterRequest = {
      model: selectedModel,
      messages: [
        { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: false,
    };

    // ── Call OpenRouter ──────────────────────────────────────────────
    let data: any;
    try {
      data = await chatCompletionWithRetry({ ...openrouterReq, stream: false }, 2);
    } catch (error: any) {
      logger.error('OpenRouter research request failed', error, { userId, model: selectedModel });
      return handleResearchError(res, error, requestId);
    }

    // ── Extract answer ───────────────────────────────────────────────
    const message = data.choices?.[0]?.message;
    const answer = message?.content || '';

    // ── Extract citations ────────────────────────────────────────────
    // Perplexity returns citations via message.annotations (url_citation type)
    // through OpenRouter. Deduplicate by URL, keeping first occurrence.
    const citations: Array<{ url: string; title: string }> = [];
    const seenUrls = new Set<string>();

    if (message?.annotations && Array.isArray(message.annotations)) {
      for (const ann of message.annotations) {
        if (ann.type === 'url_citation') {
          const url = ann.url_citation?.url || '';
          const title = ann.url_citation?.title || '';
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            citations.push({ url, title });
          }
        }
      }
    }

    // Fallback: check top-level citations array (direct Perplexity format)
    if (citations.length === 0 && data.citations && Array.isArray(data.citations)) {
      for (const url of data.citations) {
        if (typeof url === 'string' && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          citations.push({ url, title: '' });
        }
      }
    }

    // ── Debit tokens ─────────────────────────────────────────────────
    let tokenInfo: { used: number; dailyRemaining: number; weeklyRemaining: number } | undefined;

    if (data.usage) {
      const inputTokens = data.usage.prompt_tokens || 0;
      const outputTokens = data.usage.completion_tokens || 0;
      const genCost = data.id ? await fetchGenerationCost(data.id) : null;
      const normalized = genCost && genCost.totalCost > 0
        ? normalizeFromCost(genCost.totalCost)
        : calculateNormalizedTokens(resolvedModel, inputTokens, outputTokens);
      const cost = genCost && genCost.totalCost > 0
        ? costToMicrodollars(genCost.totalCost)
        : calculateCostMicrodollars(resolvedModel, inputTokens, outputTokens);
      const date = getCurrentDateString();
      const week = getCurrentWeekString();

      debitTokens(userId, date, week, normalized, inputTokens, outputTokens, cost).catch((error) => {
        logger.error('Failed to debit tokens', error, { userId, normalized });
      });

      tokenInfo = {
        used: normalized,
        dailyRemaining: Math.max(0, tokenQuota.daily.remaining - normalized),
        weeklyRemaining: tokenQuota.weekly.limit > 0 ? Math.max(0, tokenQuota.weekly.remaining - normalized) : 0,
      };
    }

    // ── Respond ──────────────────────────────────────────────────────
    logger.info('Research request completed', {
      userId,
      model: selectedModel,
      citationCount: citations.length,
      answerLength: answer.length,
      tokenInfo,
    });

    res.json({
      answer,
      citations,
      ...(tokenInfo && { tokens: tokenInfo }),
    });
  } catch (error: any) {
    logger.error('Error in research handler', error, { userId: (req as any).userId });
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process research request', error.message, requestId)
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Map OpenRouter/network errors to appropriate HTTP responses.
 */
function handleResearchError(res: Response, error: any, requestId: string): void {
  if (error.response) {
    const status = error.response.status;
    const errorData = error.response.data;

    if (status === 429) {
      res.status(429).json(
        createErrorResponse(ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded. Please try again later.', errorData, requestId)
      );
      return;
    }

    if (status === 400) {
      res.status(400).json(
        createErrorResponse(ErrorCode.OPENROUTER_API_ERROR, 'Invalid request to AI API', errorData, requestId)
      );
      return;
    }

    if (status >= 500) {
      res.status(502).json(
        createErrorResponse(ErrorCode.OPENROUTER_API_ERROR, 'AI API temporarily unavailable. Please try again.', errorData, requestId)
      );
      return;
    }

    res.status(status).json(
      createErrorResponse(ErrorCode.OPENROUTER_API_ERROR, 'AI API error', errorData, requestId)
    );
    return;
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    res.status(504).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Request timeout. Please try again.', undefined, requestId)
    );
    return;
  }

  res.status(500).json(
    createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process research request', error.message, requestId)
  );
}
