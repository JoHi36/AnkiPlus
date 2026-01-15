import { Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import * as functions from 'firebase-functions';
import { ChatRequest } from '../types';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getOrCreateUser } from '../utils/firestore';
import { checkQuota, incrementUsage, checkAnonymousQuota, incrementAnonymousUsage } from '../utils/quota';
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

    let quotaCheck;
    let userIdentifier: string;

    // Check quota based on authentication status
    if (isAuthenticated && userId) {
      // Authenticated user
      await getOrCreateUser(userId, (req as any).userEmail);
      quotaCheck = await checkQuota(userId, mode);
      userIdentifier = userId;
    } else if (anonymousId && ipAddress) {
      // Anonymous user
      quotaCheck = await checkAnonymousQuota(anonymousId, ipAddress, mode);
      userIdentifier = anonymousId;
    } else {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Invalid authentication state', undefined, requestId)
      );
      return;
    }

    if (!quotaCheck.allowed) {
      logger.warn('Quota exceeded', { userId, anonymousId, mode, quotaCheck });
      
      // Log analytics event
      if (isAuthenticated && userId) {
        const user = await getOrCreateUser(userId, (req as any).userEmail);
        await logQuotaExceeded(userId, user.tier, quotaCheck.type);
      }
      
      // Get upgrade/register URL from environment or use default
      const upgradeUrl = process.env.UPGRADE_URL || functions.config().app?.upgrade_url || 'https://anki-plus.vercel.app/register';
      
      res.status(403).json(
        createErrorResponse(
          ErrorCode.QUOTA_EXCEEDED,
          isAuthenticated 
            ? 'Tageslimit erreicht. Upgrade für mehr Requests?' 
            : 'Du hast dein Tageslimit erreicht. Kostenlos registrieren für unbegrenzt Flash Mode?',
          {
            remaining: quotaCheck.remaining,
            limit: quotaCheck.limit,
            type: quotaCheck.type,
            upgradeUrl: upgradeUrl,
            requiresAuth: !isAuthenticated,
          },
          requestId
        )
      );
      return;
    }

    logger.info('Quota check passed', { userId, anonymousId, mode, quotaCheck });

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
    const maxTokens = model.includes('gemini-3-flash-preview') ? 8192 : 2000;
    const requestData = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens,
      },
    };

    // Add system instruction if needed (simplified - full system prompt logic can be added later)
    // For now, we'll keep it simple

    // Check if streaming is requested (default: true)
    const shouldStream = body.stream !== false;
    
    logger.info('Proxying to Gemini API', { userId, anonymousId, model, messageLength: body.message.length, streaming: shouldStream });
    
    // Log analytics event
    if (isAuthenticated && userId) {
      await logChatRequest(userId, model, mode, body.message.length);
    }

    // Determine request type for usage tracking
    const requestType: 'flash' | 'deep' = mode === 'detailed' ? 'deep' : 'flash';

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
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 8000,
            retryableStatusCodes: [429, 500, 502, 503],
          }
        );

        // Increment usage counter
        if (isAuthenticated && userId) {
          incrementUsage(userId, requestType).catch((error) => {
            logger.error('Failed to increment usage', error, { userId, requestType });
          });
        } else if (anonymousId && ipAddress) {
          incrementAnonymousUsage(anonymousId, ipAddress, requestType).catch((error) => {
            logger.error('Failed to increment anonymous usage', error, { anonymousId, requestType });
          });
        }

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

        res.json({ text });
        logger.info('Chat request completed (non-streaming)', { userId });
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

    // Increment usage counter AFTER successful API request starts
    // Do this asynchronously to not block streaming
    if (isAuthenticated && userId) {
      incrementUsage(userId, requestType).catch((error) => {
        logger.error('Failed to increment usage', error, { userId, requestType });
        // Don't fail the request if usage increment fails
      });
    } else if (anonymousId && ipAddress) {
      incrementAnonymousUsage(anonymousId, ipAddress, requestType).catch((error) => {
        logger.error('Failed to increment anonymous usage', error, { anonymousId, requestType });
        // Don't fail the request if usage increment fails
      });
    }

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
                  res.write('data: [DONE]\n\n');
                  res.end();
                  return;
                }
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
          if (buffer.startsWith('data: ')) {
            const data = buffer.substring(6);
            const jsonData = JSON.parse(data);
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
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
      logger.info('Chat request completed', { userId });
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

