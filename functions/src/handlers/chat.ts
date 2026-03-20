import { Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import * as functions from 'firebase-functions';
import { ChatRequest } from '../types';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getOrCreateUser, debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
import { checkTokenQuota, checkAnonymousTokenQuota } from '../utils/tokenQuota';
import { calculateNormalizedTokens, calculateCostMicrodollars } from '../utils/tokenPricing';
import { retryHttpRequest } from '../utils/retry';
import { logQuotaExceeded, logChatRequest, logChatError } from '../utils/analytics';

/**
 * POST /api/chat
 * Proxies chat requests to Google Gemini API with streaming support
 * Requires authentication
 */
export async function chatHandler(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createLogger(requestId);

  try {
    // Token validation is handled by middleware (validateTokenOptional)
    // Either userId (authenticated) or anonymousId (anonymous) should be present
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

    // Get request body
    const body: ChatRequest = req.body;

    if (!body.message) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Message is required', undefined, requestId)
      );
      return;
    }

    // Get model (default to gemini-3-flash-preview)
    const model = body.model || 'gemini-3-flash-preview';
    const mode = body.mode || 'compact';

    // Token-based quota check
    let tokenQuota: {
      allowed: boolean;
      daily: { used: number; limit: number; remaining: number };
      weekly: { used: number; limit: number; remaining: number };
      tier: 'free' | 'tier1' | 'tier2';
    };

    if (isAuthenticated && userId) {
      // Authenticated user
      await getOrCreateUser(userId, (req as any).userEmail);
      tokenQuota = await checkTokenQuota(userId);
    } else if (anonymousId && ipAddress) {
      // Anonymous user — wrap flat result into unified shape
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

      // Log analytics event
      if (isAuthenticated && userId) {
        const user = await getOrCreateUser(userId, (req as any).userEmail);
        await logQuotaExceeded(userId, user.tier, 'tokens');
      }

      // Get upgrade/register URL from environment or use default
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

    // Get API key from environment
    const apiKey = process.env.GOOGLE_AI_API_KEY || functions.config().google?.ai_api_key;
    if (!apiKey) {
      logger.error('Google AI API key not configured');
      res.status(500).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'API key not configured', undefined, requestId)
      );
      return;
    }

    // Build Gemini API request
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;

    // Prepare contents array
    const contents: any[] = [];

    // Add history if provided
    if (body.history && body.history.length > 0) {
      // Limit history to last 4 messages
      const historyToUse = body.history.slice(-4);
      for (const histMsg of historyToUse) {
        contents.push({
          role: histMsg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: histMsg.content.substring(0, 1500) }], // Limit content length
        });
      }
    }

    // Build enhanced message with context
    let enhancedMessage = body.message;

    if (body.context) {
      const contextParts: string[] = [];
      const isQuestion = body.context.isQuestion !== false;

      // Add question if available
      if (body.context.question || body.context.frontField) {
        const question = (body.context.question || body.context.frontField || '').substring(0, 1000);
        if (question) {
          contextParts.push(`Kartenfrage: ${question}`);
        }
      }

      // Add answer if available and not a question
      if (!isQuestion && body.context.answer) {
        const answer = body.context.answer.substring(0, 800);
        if (answer) {
          contextParts.push(`Kartenantwort: ${answer}`);
        }
      }

      // Add stats if available
      if (body.context.stats) {
        const stats = body.context.stats;
        const knowledgeScore = stats.knowledgeScore || 0;
        const reps = stats.reps || 0;
        const lapses = stats.lapses || 0;
        const ivl = stats.interval || 0;

        let statsText = `\nKartenstatistiken: Kenntnisscore ${knowledgeScore}% (0=neu, 100=sehr gut bekannt), ${reps} Wiederholungen, ${lapses} Fehler, Intervall ${ivl} Tage. `;

        if (knowledgeScore >= 70) {
          statsText += 'Karte ist gut bekannt - verwende fortgeschrittene Konzepte und vertiefende Fragen.';
        } else if (knowledgeScore >= 40) {
          statsText += 'Karte ist mäßig bekannt - verwende mittlere Schwierigkeit mit klaren Erklärungen.';
        } else {
          statsText += 'Karte ist neu oder wenig bekannt - verwende einfache Sprache und grundlegende Erklärungen.';
        }

        contextParts.push(statsText);
      }

      if (contextParts.length > 0) {
        const workflowInstruction = isQuestion
          ? '\n\nWICHTIG: Die Kartenantwort ist noch NICHT aufgedeckt. Wenn der Benutzer eine Antwort gibt, prüfe sie gegen die korrekte Antwort (die du kennst, aber noch nicht verraten hast). Wenn nach einem Hinweis gefragt wird, gib einen hilfreichen Hinweis OHNE die Antwort zu verraten.'
          : '\n\nWICHTIG: Die Kartenantwort ist bereits aufgedeckt. Beantworte Fragen zur Karte, erkläre Konzepte, stelle vertiefende Fragen oder biete weitere Lernhilfen an.';

        enhancedMessage = `Kontext der aktuellen Anki-Karte:\n${contextParts.join('\n')}${workflowInstruction}\n\nBenutzerfrage: ${body.message}`;
      }
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: enhancedMessage }],
    });

    // Build request payload
    const defaultMaxTokens = model.includes('gemini-3-flash-preview') ? 8192 : 2000;
    const temperature = (body.temperature !== undefined && body.temperature >= 0 && body.temperature <= 2)
      ? body.temperature : 0.7;
    const maxTokens = (body.maxOutputTokens !== undefined && body.maxOutputTokens > 0 && body.maxOutputTokens <= 8192)
      ? body.maxOutputTokens : defaultMaxTokens;
    const requestData: any = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    // Note: thinkingConfig removed - not supported on v1beta generateContent API

    // Add system instruction if needed (simplified - full system prompt logic can be added later)
    // For now, we'll keep it simple

    // Check if streaming is requested (default: true)
    const shouldStream = body.stream !== false;

    logger.info('Proxying to Gemini API', { userId, anonymousId, model, messageLength: body.message.length, streaming: shouldStream });

    // Log analytics event
    if (isAuthenticated && userId) {
      await logChatRequest(userId, model, mode, body.message.length);
    }

    // Effective userId for token debit
    const effectiveUserId = isAuthenticated && userId ? userId : (anonymousId ? `anon_${anonymousId}` : null);
    const date = getCurrentDateString();
    const week = getCurrentWeekString();

    // Handle non-streaming requests
    if (!shouldStream) {
      try {
        const response = await retryHttpRequest(
          () =>
            axios.post(geminiUrl.replace(':streamGenerateContent', ':generateContent'), requestData, {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 30000, // 30 second timeout for non-streaming
            }),
          {
            maxRetries: 1,
            initialDelay: 500,
            maxDelay: 2000,
            retryableStatusCodes: [500, 502, 503],
          }
        );

        // Extract text from response
        const result = response.data;
        let text = '';

        if (result.candidates && result.candidates[0]) {
          const candidate = result.candidates[0];
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                text += part.text;
              }
            }
          }
        }

        // Debit tokens based on usageMetadata
        let tokenInfo: { used: number; dailyRemaining: number; weeklyRemaining: number } | undefined;
        if (result.usageMetadata && effectiveUserId) {
          const inputTokens = result.usageMetadata.promptTokenCount || 0;
          const outputTokens = result.usageMetadata.candidatesTokenCount || 0;
          const normalized = calculateNormalizedTokens(model, inputTokens, outputTokens);
          const cost = calculateCostMicrodollars(model, inputTokens, outputTokens);

          debitTokens(effectiveUserId, date, week, normalized, inputTokens, outputTokens, cost).catch((error) => {
            logger.error('Failed to debit tokens', error, { effectiveUserId, normalized });
          });

          tokenInfo = {
            used: normalized,
            dailyRemaining: Math.max(0, tokenQuota.daily.remaining - normalized),
            weeklyRemaining: tokenQuota.weekly.limit > 0 ? Math.max(0, tokenQuota.weekly.remaining - normalized) : 0,
          };
        }

        res.json({ text, tokens: tokenInfo });
        logger.info('Chat request completed (non-streaming)', { userId, tokenInfo });
        return;
      } catch (error: any) {
        logger.error('Non-streaming request failed', error, { userId, model });

        if (error.response) {
          const status = error.response.status;
          const errorData = error.response.data;

          if (status === 429) {
            res.status(429).json(
              createErrorResponse(ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded. Please try again later.', errorData, requestId)
            );
            return;
          }

          res.status(status).json(
            createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Gemini API error', errorData, requestId)
          );
          return;
        }

        res.status(500).json(
          createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process chat request', error.message, requestId)
        );
        return;
      }
    }

    // Make streaming request to Gemini API with retry logic
    let response: AxiosResponse;
    try {
      response = await retryHttpRequest(
        () =>
          axios.post(geminiUrl, requestData, {
            responseType: 'stream',
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 60000, // 60 second timeout
          }),
        {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 8000,
          retryableStatusCodes: [429, 500, 502, 503], // Retry on rate limit and server errors
        }
      );
    } catch (error: any) {
      // Handle retry failures
      logger.error('Gemini API request failed after retries', error, { userId, model });

      // Log analytics event
      const user = await getOrCreateUser(userId, (req as any).userEmail);
      await logChatError(
        userId,
        error.response?.status?.toString() || 'UNKNOWN',
        error.message || 'Gemini API request failed',
        user.tier
      );

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
            createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Invalid request to Gemini API', errorData, requestId)
          );
          return;
        }

        if (status >= 500) {
          res.status(502).json(
            createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Gemini API temporarily unavailable. Please try again.', errorData, requestId)
          );
          return;
        }

        res.status(status).json(
          createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Gemini API error', errorData, requestId)
        );
        return;
      }

      // Network or timeout error
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        res.status(504).json(
          createErrorResponse(ErrorCode.BACKEND_ERROR, 'Request timeout. Please try again.', undefined, requestId)
        );
        return;
      }

      // Generic error
      res.status(500).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to connect to Gemini API. Please try again.', error.message, requestId)
      );
      return;
    }

    // Set up SSE headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Track usageMetadata from Gemini stream for post-stream token debit
    let lastUsageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null = null;

    // Stream response from Gemini to client
    let buffer = '';
    let chunkCount = 0;
    let textChunkCount = 0;

    response.data.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      chunkCount++;

      logger.debug('Received chunk from Gemini', {
        chunkSize: chunkStr.length,
        chunkCount,
        preview: chunkStr.substring(0, 100)
      });

      // Extract complete JSON objects from buffer
      // Gemini sends JSON array stream: [{...}, {...}, ...]
      // We need to extract complete objects as they arrive
      let processedLength = 0;

      // Find complete JSON objects in buffer by counting braces
      let depth = 0;
      let start = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            // Found complete JSON object
            try {
              const objStr = buffer.substring(start, i + 1);
              const jsonData = JSON.parse(objStr);

              logger.debug('Extracted JSON object', {
                hasCandidates: !!jsonData.candidates,
                candidateCount: jsonData.candidates?.length || 0
              });

              // Extract text from Gemini response
              if (jsonData.candidates && jsonData.candidates[0]) {
                const candidate = jsonData.candidates[0];

                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      textChunkCount++;
                      logger.info('Forwarding text chunk', {
                        textLength: part.text.length,
                        textChunkCount,
                        preview: part.text.substring(0, 50)
                      });
                      // Forward text chunk to client
                      res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                    }
                  }
                }

                // Check for finish reason
                if (candidate.finishReason) {
                  logger.info('Gemini stream finished', {
                    finishReason: candidate.finishReason,
                    textChunkCount,
                    chunkCount
                  });
                  // Don't send [DONE] here — let the 'end' handler do token debit first
                }
              }

              // Capture usageMetadata for post-stream token debit
              if (jsonData.usageMetadata) {
                lastUsageMetadata = jsonData.usageMetadata;
              }

              processedLength = i + 1;
            } catch (error) {
              logger.debug('Failed to parse JSON object', {
                error: (error as Error).message,
                preview: buffer.substring(start, Math.min(i + 1, start + 100))
              });
            }
            start = -1;
          }
        }
      }

      // Remove processed JSON objects from buffer
      if (processedLength > 0) {
        // Also remove leading commas, whitespace, and array brackets
        let newBuffer = buffer.substring(processedLength);
        newBuffer = newBuffer.replace(/^[\s,\[\]]+/, '');
        buffer = newBuffer;
      }
    });

    response.data.on('end', () => {
      // Send final chunk if buffer has content
      if (buffer.trim()) {
        try {
          // Try to parse remaining buffer as JSON
          const cleanBuffer = buffer.replace(/^[\s,\[\]]+/, '').replace(/[\s,\[\]]+$/, '');
          if (cleanBuffer.startsWith('{')) {
            const jsonData = JSON.parse(cleanBuffer);
            if (jsonData.candidates && jsonData.candidates[0]) {
              const candidate = jsonData.candidates[0];
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                  }
                }
              }
            }
            // Capture usageMetadata from remaining buffer
            if (jsonData.usageMetadata) {
              lastUsageMetadata = jsonData.usageMetadata;
            }
          }
        } catch (error) {
          // Ignore parse errors
        }
      }

      // Debit tokens and send [DONE] with token info
      if (lastUsageMetadata && effectiveUserId) {
        const inputTokens = lastUsageMetadata.promptTokenCount || 0;
        const outputTokens = lastUsageMetadata.candidatesTokenCount || 0;
        const normalized = calculateNormalizedTokens(model, inputTokens, outputTokens);
        const cost = calculateCostMicrodollars(model, inputTokens, outputTokens);

        debitTokens(effectiveUserId, date, week, normalized, inputTokens, outputTokens, cost).catch((error) => {
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
      logger.info('Chat request completed', { userId, lastUsageMetadata });
    });

    response.data.on('error', (error: Error) => {
      logger.error('Streaming error', error, { userId });
      res.write(`data: ${JSON.stringify({ error: 'Streaming error occurred' })}\n\n`);
      res.end();
    });
  } catch (error: any) {
    logger.error('Error in chat handler', error, { userId: (req as any).userId });

    // Handle specific error types
    if (error.response) {
      // Gemini API error
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 429) {
        res.status(429).json(
          createErrorResponse(ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', errorData, requestId)
        );
        return;
      }

      if (status === 400) {
        res.status(400).json(
          createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Invalid request to Gemini API', errorData, requestId)
        );
        return;
      }

      res.status(500).json(
        createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Gemini API error', errorData, requestId)
      );
      return;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      res.status(504).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'Request timeout', undefined, requestId)
      );
      return;
    }

    // Generic error
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process chat request', error.message, requestId)
    );
  }
}
