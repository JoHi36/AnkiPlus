import { Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import * as functions from 'firebase-functions';
import { ChatRequest } from '../types';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { getOrCreateUser, getCurrentDateString } from '../utils/firestore';

/**
 * POST /api/chat
 * Proxies chat requests to Google Gemini API with streaming support
 * Requires authentication
 */
export async function chatHandler(
  req: Request,
  res: Response
): Promise<void> {
  const logger = createLogger();

  try {
    // Token validation is handled by middleware in index.ts
    // userId is attached to req by validateToken middleware
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(ErrorCode.TOKEN_INVALID, 'User ID not found'));
      return;
    }

    logger.info('Chat request received', { userId });

    // Get request body
    const body: ChatRequest = req.body;

    if (!body.message) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Message is required')
      );
      return;
    }

    // Get user to check quota (quota check will be implemented in Prompt 4)
    await getOrCreateUser(userId, (req as any).userEmail);

    // Get model (default to gemini-3-flash-preview)
    const model = body.model || 'gemini-3-flash-preview';
    const mode = body.mode || 'compact';

    // Get API key from environment
    const apiKey = process.env.GOOGLE_AI_API_KEY || functions.config().google?.ai_api_key;
    if (!apiKey) {
      logger.error('Google AI API key not configured');
      res.status(500).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'API key not configured')
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

    logger.info('Proxying to Gemini API', { userId, model, messageLength: body.message.length });

    // Make streaming request to Gemini API
    const response: AxiosResponse = await axios.post(
      geminiUrl,
      requestData,
      {
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout
      }
    );

    // Set up SSE headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Stream response from Gemini to client
    let buffer = '';
    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() === '') continue;
        
        // Gemini streaming format: data: {...}
        if (line.startsWith('data: ')) {
          try {
            const data = line.substring(6); // Remove 'data: ' prefix
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            
            const jsonData = JSON.parse(data);
            
            // Extract text from Gemini response
            if (jsonData.candidates && jsonData.candidates[0]) {
              const candidate = jsonData.candidates[0];
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    // Forward text chunk to client
                    res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                  }
                }
              }
            }
          } catch (error) {
            // Ignore JSON parse errors for incomplete chunks
            logger.debug('Failed to parse chunk', { error: (error as Error).message, line });
          }
        }
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
          createErrorResponse(ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', errorData)
        );
        return;
      }

      if (status === 400) {
        res.status(400).json(
          createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Invalid request to Gemini API', errorData)
        );
        return;
      }

      res.status(500).json(
        createErrorResponse(ErrorCode.GEMINI_API_ERROR, 'Gemini API error', errorData)
      );
      return;
    }

    if (error.code === 'ECONNABORTED') {
      res.status(504).json(
        createErrorResponse(ErrorCode.BACKEND_ERROR, 'Request timeout')
      );
      return;
    }

    // Generic error
    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to process chat request', error.message)
    );
  }
}

