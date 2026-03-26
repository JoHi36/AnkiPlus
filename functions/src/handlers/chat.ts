import { Request, Response } from 'express';
import * as functions from 'firebase-functions';
import { ChatRequest } from '../types';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getOrCreateUser, debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
import { checkTokenQuota, checkAnonymousTokenQuota } from '../utils/tokenQuota';
import { calculateNormalizedTokens, calculateCostMicrodollars, normalizeFromCost, costToMicrodollars } from '../utils/tokenPricing';
import { logQuotaExceeded, logChatRequest, logChatError } from '../utils/analytics';
import { chatCompletionWithRetry, resolveModel, OpenRouterRequest, fetchGenerationCost } from '../utils/openrouter';
import { buildSystemPrompt, Insight } from '../utils/systemPrompt';
import {
  geminiToolsToOpenAI,
  translateHistory,
  openAIToolCallsToGemini,
  OpenAIMessage,
} from '../utils/toolTranslation';

/**
 * POST /api/chat
 * Proxies chat requests to OpenRouter with streaming support.
 * Builds system prompts server-side based on agent type and card context.
 * Requires authentication (or anonymous device ID).
 */
export async function chatHandler(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createLogger(requestId);

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const userId = (req as any).userId;
    const anonymousId = (req as any).anonymousId;
    const ipAddress = (req as any).ipAddress;
    const isAuthenticated = (req as any).isAuthenticated !== false;

    if (!userId && !anonymousId) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'User ID or Device ID required', undefined, requestId)
      );
      return;
    }

    logger.info('Chat request received', { userId, anonymousId, isAuthenticated });

    // ── Validate body ────────────────────────────────────────────────
    const body: ChatRequest = req.body;

    if (!body.message) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Message is required', undefined, requestId)
      );
      return;
    }

    // ── Extract new + legacy fields (backward compat) ────────────────
    const agent = body.agent || 'tutor';
    const cardContext = body.cardContext || body.context || undefined;
    const insights = body.insights || [];
    const responseStyle = body.responseStyle || body.mode || 'compact';
    const model = body.model || 'gemini-3-flash-preview';
    const mode = body.mode || 'compact';

    // ── Token quota check ────────────────────────────────────────────
    let tokenQuota: {
      allowed: boolean;
      daily: { used: number; limit: number; remaining: number };
      weekly: { used: number; limit: number; remaining: number };
      tier: 'free' | 'tier1' | 'tier2';
    };

    if (isAuthenticated && userId) {
      await getOrCreateUser(userId, (req as any).userEmail);
      tokenQuota = await checkTokenQuota(userId);
    } else if (anonymousId && ipAddress) {
      const anonResult = await checkAnonymousTokenQuota(anonymousId, ipAddress);
      tokenQuota = {
        allowed: anonResult.allowed,
        daily: { used: anonResult.used, limit: anonResult.limit, remaining: anonResult.remaining },
        weekly: { used: 0, limit: 0, remaining: 0 },
        tier: 'free',
      };
    } else {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid authentication state', undefined, requestId)
      );
      return;
    }

    if (!tokenQuota.allowed) {
      logger.warn('Token quota exceeded', { userId, anonymousId, mode, tokenQuota });

      if (isAuthenticated && userId) {
        const user = await getOrCreateUser(userId, (req as any).userEmail);
        await logQuotaExceeded(userId, user.tier, 'tokens');
      }

      const upgradeUrl = process.env.UPGRADE_URL || functions.config().app?.upgrade_url || 'https://anki-plus.vercel.app/register';

      res.status(403).json(
        createErrorResponse(
          ErrorCode.QUOTA_EXCEEDED,
          isAuthenticated
            ? 'Token-Limit erreicht. Upgrade für mehr Tokens?'
            : 'Du hast dein Token-Limit erreicht. Kostenlos registrieren für mehr Tokens?',
          {
            daily: tokenQuota.daily,
            weekly: tokenQuota.weekly,
            tier: tokenQuota.tier,
            upgradeUrl: upgradeUrl,
            requiresAuth: !isAuthenticated,
          },
          requestId
        )
      );
      return;
    }

    logger.info('Token quota check passed', { userId, anonymousId, mode, tokenQuota });

    // ── Build system prompt server-side ──────────────────────────────
    const cardContextStr = cardContext ? formatCardContext(cardContext) : undefined;
    const insightObjects: Insight[] = insights.map((text: string) => ({ type: 'insight', text }));
    const toolNames = body.tools_definitions
      ? extractToolNames(body.tools_definitions)
      : undefined;

    const systemPrompt = buildSystemPrompt({
      agent,
      cardContext: cardContextStr,
      insights: insightObjects.length > 0 ? insightObjects : undefined,
      mode,
      responseStyle,
      tools: toolNames,
    });

    // ── Build OpenAI-format messages ─────────────────────────────────
    const messages: OpenAIMessage[] = [];

    // System message
    messages.push({ role: 'system', content: systemPrompt });

    // History (translate from possible Gemini format)
    if (body.history && body.history.length > 0) {
      const historyToUse = body.history.slice(-20); // More generous history than before
      const translatedHistory = translateHistory(historyToUse);
      messages.push(...translatedHistory);
    }

    // Current user message
    messages.push({ role: 'user', content: body.message });

    // ── Translate tools from Gemini -> OpenAI format ─────────────────
    const openaiTools = geminiToolsToOpenAI(body.tools_definitions);

    // ── Build OpenRouter request ─────────────────────────────────────
    const resolvedModel = resolveModel(model);
    const temperature = (body.temperature !== undefined && body.temperature >= 0 && body.temperature <= 2)
      ? body.temperature : 0.7;
    const defaultMaxTokens = resolvedModel.includes('gemini') ? 8192 : 2000;
    const maxTokens = (body.maxOutputTokens !== undefined && body.maxOutputTokens > 0 && body.maxOutputTokens <= 8192)
      ? body.maxOutputTokens : defaultMaxTokens;

    const shouldStream = body.stream !== false;

    const openrouterReq: OpenRouterRequest = {
      model,
      messages: messages as any,
      temperature,
      max_tokens: maxTokens,
      stream: shouldStream,
      ...(openaiTools && { tools: openaiTools }),
    };

    logger.info('Proxying to OpenRouter', {
      userId, anonymousId, model, resolvedModel, agent,
      messageLength: body.message.length, streaming: shouldStream,
      hasTools: !!openaiTools,
    });

    // Log analytics
    if (isAuthenticated && userId) {
      await logChatRequest(userId, model, mode, body.message.length);
    }

    // Effective userId for token debit
    const effectiveUserId = isAuthenticated && userId ? userId : (anonymousId ? `anon_${anonymousId}` : null);
    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    // ── Non-streaming path ───────────────────────────────────────────
    if (!shouldStream) {
      try {
        const data = await chatCompletionWithRetry({ ...openrouterReq, stream: false }, 1);

        // Extract response
        let text = '';
        let toolCallsResponse: any = undefined;

        if (data.choices && data.choices[0]) {
          const choice = data.choices[0];
          if (choice.message) {
            text = choice.message.content || '';

            // If the model wants to call tools, translate back to Gemini format
            if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
              toolCallsResponse = openAIToolCallsToGemini(choice.message.tool_calls);
            }
          }
        }

        // Debit tokens — prefer OpenRouter's actual cost over manual calculation
        let tokenInfo: { used: number; dailyRemaining: number; weeklyRemaining: number } | undefined;
        if (data.usage && effectiveUserId) {
          const inputTokens = data.usage.prompt_tokens || 0;
          const outputTokens = data.usage.completion_tokens || 0;

          // Try to get actual cost from OpenRouter generation API
          let normalized: number;
          let cost: number;
          const genCost = data.id ? await fetchGenerationCost(data.id) : null;
          if (genCost && genCost.totalCost > 0) {
            normalized = normalizeFromCost(genCost.totalCost);
            cost = costToMicrodollars(genCost.totalCost);
          } else {
            // Fallback to manual calculation
            normalized = calculateNormalizedTokens(resolvedModel, inputTokens, outputTokens);
            cost = calculateCostMicrodollars(resolvedModel, inputTokens, outputTokens);
          }

          debitTokens(effectiveUserId, date, week, normalized, inputTokens, outputTokens, cost).catch((error) => {
            logger.error('Failed to debit tokens', error, { effectiveUserId, normalized });
          });

          tokenInfo = {
            used: normalized,
            dailyRemaining: Math.max(0, tokenQuota.daily.remaining - normalized),
            weeklyRemaining: tokenQuota.weekly.limit > 0 ? Math.max(0, tokenQuota.weekly.remaining - normalized) : 0,
          };
        }

        const responsePayload: any = { text, tokens: tokenInfo };
        if (toolCallsResponse) {
          responsePayload.toolCalls = toolCallsResponse;
        }

        res.json(responsePayload);
        logger.info('Chat request completed (non-streaming)', { userId, tokenInfo });
        return;
      } catch (error: any) {
        logger.error('Non-streaming request failed', error, { userId, model });
        return handleOpenRouterError(res, error, requestId, logger);
      }
    }

    // ── Streaming path ───────────────────────────────────────────────
    let stream: any;
    try {
      stream = await chatCompletionWithRetry(openrouterReq, 3);
    } catch (error: any) {
      logger.error('OpenRouter streaming request failed after retries', error, { userId, model });

      // Log analytics
      if (isAuthenticated && userId) {
        const user = await getOrCreateUser(userId, (req as any).userEmail);
        await logChatError(
          userId,
          error.response?.status?.toString() || 'UNKNOWN',
          error.message || 'OpenRouter request failed',
          user.tier
        );
      }

      return handleOpenRouterError(res, error, requestId, logger);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Parse OpenRouter SSE stream and translate to client format
    let buffer = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let streamGenerationId = '';
    let pendingToolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }> = [];

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Process complete SSE lines
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6); // Remove 'data: '

        // End of stream signal
        if (payload === '[DONE]') {
          continue; // Let the 'end' handler finalize
        }

        try {
          const data = JSON.parse(payload);

          // Capture generation ID from first chunk for cost lookup
          if (data.id && !streamGenerationId) {
            streamGenerationId = data.id;
          }

          // Extract usage from final chunk (OpenRouter may include it)
          if (data.usage) {
            totalInputTokens = data.usage.prompt_tokens || 0;
            totalOutputTokens = data.usage.completion_tokens || 0;
          }

          if (!data.choices || data.choices.length === 0) continue;

          const delta = data.choices[0].delta;
          if (!delta) continue;

          // Text content -> forward as { text: "..." }
          if (delta.content) {
            res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
          }

          // Tool calls accumulation (streamed incrementally)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = {
                  id: tc.id || '',
                  type: tc.type || 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.id) pendingToolCalls[idx].id = tc.id;
              if (tc.function?.name) pendingToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          // Check for finish reason
          const finishReason = data.choices[0].finish_reason;
          if (finishReason === 'tool_calls' && pendingToolCalls.length > 0) {
            // Send tool calls in Gemini format to client
            const geminiFormat = openAIToolCallsToGemini(pendingToolCalls);
            res.write(`data: ${JSON.stringify({ toolCalls: geminiFormat })}\n\n`);
            pendingToolCalls = [];
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    });

    stream.on('end', async () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.usage) {
              totalInputTokens = data.usage.prompt_tokens || 0;
              totalOutputTokens = data.usage.completion_tokens || 0;
            }
            if (data.choices?.[0]?.delta?.content) {
              res.write(`data: ${JSON.stringify({ text: data.choices[0].delta.content })}\n\n`);
            }
          } catch {
            // Ignore
          }
        }
      }

      // Debit tokens and send done signal — prefer OpenRouter actual cost
      if (effectiveUserId && (totalInputTokens > 0 || totalOutputTokens > 0)) {
        let normalized: number;
        let cost: number;
        const genCost = streamGenerationId ? await fetchGenerationCost(streamGenerationId) : null;
        if (genCost && genCost.totalCost > 0) {
          normalized = normalizeFromCost(genCost.totalCost);
          cost = costToMicrodollars(genCost.totalCost);
        } else {
          normalized = calculateNormalizedTokens(resolvedModel, totalInputTokens, totalOutputTokens);
          cost = calculateCostMicrodollars(resolvedModel, totalInputTokens, totalOutputTokens);
        }

        debitTokens(effectiveUserId, date, week, normalized, totalInputTokens, totalOutputTokens, cost).catch((error) => {
          logger.error('Failed to debit tokens', error, { effectiveUserId, normalized });
        });

        const tokenInfo = {
          used: normalized,
          dailyRemaining: Math.max(0, tokenQuota.daily.remaining - normalized),
          weeklyRemaining: tokenQuota.weekly.limit > 0 ? Math.max(0, tokenQuota.weekly.remaining - normalized) : 0,
        };

        res.write(`data: ${JSON.stringify({ done: true, tokens: tokenInfo })}\n\n`);
      } else {
        res.write('data: [DONE]\n\n');
      }

      res.end();
      logger.info('Chat request completed (streaming)', { userId, totalInputTokens, totalOutputTokens });
    });

    stream.on('error', (error: Error) => {
      logger.error('Streaming error', error, { userId });
      res.write(`data: ${JSON.stringify({ error: 'Streaming error occurred' })}\n\n`);
      res.end();
    });
  } catch (error: any) {
    logger.error('Error in chat handler', error, { userId: (req as any).userId });
    return handleOpenRouterError(res, error, requestId, createLogger(requestId));
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Format card context object into a string for system prompt injection.
 */
function formatCardContext(ctx: any): string {
  const parts: string[] = [];

  if (ctx.question || ctx.frontField) {
    parts.push(`Kartenfrage: ${(ctx.question || ctx.frontField || '').substring(0, 1000)}`);
  }

  if (ctx.answer) {
    parts.push(`Kartenantwort: ${ctx.answer.substring(0, 800)}`);
  }

  if (ctx.deckName) {
    parts.push(`Deck: ${ctx.deckName}`);
  }

  if (ctx.tags && ctx.tags.length > 0) {
    parts.push(`Tags: ${ctx.tags.join(', ')}`);
  }

  if (ctx.stats) {
    const s = ctx.stats;
    parts.push(
      `Statistiken: Kenntnisscore ${s.knowledgeScore || 0}%, ${s.reps || 0} Wdh., ${s.lapses || 0} Fehler, Intervall ${s.interval || 0} Tage`
    );
  }

  const isQuestion = ctx.isQuestion !== false;
  if (isQuestion) {
    parts.push('WICHTIG: Die Kartenantwort ist noch NICHT aufgedeckt.');
  } else {
    parts.push('WICHTIG: Die Kartenantwort ist bereits aufgedeckt.');
  }

  return parts.join('\n');
}

/**
 * Extract tool names from Gemini-format tool definitions.
 */
function extractToolNames(toolDefs: any[]): string[] {
  const names: string[] = [];
  for (const tool of toolDefs) {
    if (tool.functionDeclarations) {
      for (const fn of tool.functionDeclarations) {
        if (fn.name) names.push(fn.name);
      }
    }
  }
  return names;
}

/**
 * Unified error handler for OpenRouter/network errors.
 * Maps HTTP statuses to appropriate client error responses.
 */
function handleOpenRouterError(
  res: Response,
  error: any,
  requestId: string,
  logger: ReturnType<typeof createLogger>
): void {
  // Don't send response if headers already sent (streaming case)
  if (res.headersSent) {
    try {
      res.write(`data: ${JSON.stringify({ error: 'Request failed' })}\n\n`);
      res.end();
    } catch {
      // Connection may be dead
    }
    return;
  }

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
    createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process chat request', error.message, requestId)
  );
}
