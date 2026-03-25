import { Request, Response } from 'express';
import { createErrorResponse, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logging';
import { debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';
import { calculateNormalizedTokens, calculateCostMicrodollars } from '../utils/tokenPricing';
import { chatCompletionWithRetry, resolveModel, OpenRouterRequest } from '../utils/openrouter';

// Fast, cheap model for structured extraction
const EXTRACTION_MODEL = 'gemini-2.5-flash';

const EXTRACTION_PROMPT = `Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Lernkarte.

KARTE: {question}

CHAT:
{chat_messages}

FOKUS:
Erfasse was der NUTZER in diesem Chat gelernt, gefragt oder falsch verstanden hat.
Fasse NICHT den Tutor-Text zusammen — erfasse das Lernverhalten des Nutzers:

1. FRAGEN des Nutzers → zeigen Wissenslücken oder aktives Interesse (type: "learned")
2. FEHLER/VERWECHSLUNGEN → was der Nutzer falsch verstanden hat (type: "weakness")
3. UNSICHERHEITEN → wo der Nutzer nachfragen musste (type: "weakness")
4. SCHLÜSSELMOMENTE → was der Nutzer erst durch die Erklärung verstanden hat (type: "learned")

REGELN:
- Formuliere aus Nutzerperspektive: "Gefragt nach X", "Verwechslung: X vs Y", "Verstanden: X"
- Jede Frage des Nutzers ist eine potenzielle Erkenntnis (zeigt Interesse oder Wissenslücke)
- NUR kartenrelevante Erkenntnisse, kein Off-Topic/Smalltalk
- Max 10 Einträge
- NUR das JSON-Array ausgeben, KEIN anderer Text

BEISPIEL-OUTPUT:
[{"text":"Gefragt nach weiteren Ansätzen am Tuber ischiadicum","type":"learned"},{"text":"Verwechslung: M. pterygoideus lateralis vs. medialis","type":"weakness"},{"text":"Verstanden: Km ändert sich nur bei kompetitiver Hemmung","type":"learned"}]`;

interface InsightItem {
  type: 'learned' | 'weakness';
  text: string;
}

interface InsightsRequestBody {
  messages: Array<{ role: string; content: string }>;
  cardContext?: { question?: string; answer?: string };
}

/**
 * POST /insights/extract
 * Extracts learning insights from chat history using a fast model via OpenRouter.
 * Requires authentication.
 */
export async function insightsExtractHandler(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createLogger(requestId);

  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json(
        createErrorResponse(ErrorCode.TOKEN_INVALID, 'Authentication required', undefined, requestId)
      );
      return;
    }

    // ── Validate body ────────────────────────────────────────────────
    const body: InsightsRequestBody = req.body;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, 'messages array is required and must not be empty', undefined, requestId)
      );
      return;
    }

    logger.info('Insights extraction requested', { userId, messageCount: body.messages.length });

    // ── Build extraction prompt ──────────────────────────────────────
    const question = (body.cardContext?.question || '').substring(0, 300);

    // Format chat messages into compact text
    const chatLines = body.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20) // Keep last 20 messages
      .map((m) => {
        const sender = m.role === 'user' ? 'User' : 'Tutor';
        const text = (m.content || '').substring(0, 400);
        return `${sender}: ${text}`;
      });
    const chatStr = chatLines.join('\n').substring(0, 3000);

    const prompt = EXTRACTION_PROMPT
      .replace('{question}', question)
      .replace('{chat_messages}', chatStr);

    // ── Call OpenRouter (non-streaming) ──────────────────────────────
    const resolvedModel = resolveModel(EXTRACTION_MODEL);

    const openrouterReq: OpenRouterRequest = {
      model: EXTRACTION_MODEL,
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      stream: false,
    };

    const data = await chatCompletionWithRetry(openrouterReq, 1);

    // ── Extract response text ────────────────────────────────────────
    const responseText: string = data.choices?.[0]?.message?.content || '';

    // ── Parse JSON insights ──────────────────────────────────────────
    let insights: InsightItem[] = [];
    try {
      insights = parseInsightsResponse(responseText);
    } catch (parseError) {
      logger.warn('Failed to parse insights response, returning empty array', { responseText: responseText.substring(0, 200) });
      // Return empty array gracefully
    }

    // ── Debit tokens ─────────────────────────────────────────────────
    let tokenInfo: { used: number } | undefined;
    if (data.usage) {
      const inputTokens = data.usage.prompt_tokens || 0;
      const outputTokens = data.usage.completion_tokens || 0;
      const normalized = calculateNormalizedTokens(resolvedModel, inputTokens, outputTokens);
      const cost = calculateCostMicrodollars(resolvedModel, inputTokens, outputTokens);
      const date = getCurrentDateString();
      const week = getCurrentWeekString();

      debitTokens(userId, date, week, normalized, inputTokens, outputTokens, cost).catch((error) => {
        logger.error('Failed to debit tokens', error, { userId, normalized });
      });

      tokenInfo = { used: normalized };
    }

    logger.info('Insights extraction completed', { userId, insightCount: insights.length, tokenInfo });

    res.json({ insights, tokens: tokenInfo });
  } catch (error: any) {
    logger.error('Error in insights extract handler', error, { userId: (req as any).userId });

    if (res.headersSent) return;

    res.status(500).json(
      createErrorResponse(ErrorCode.BACKEND_ERROR, 'Failed to extract insights', error.message, requestId)
    );
  }
}

/**
 * Parse the AI response text into a validated insights array.
 * Handles markdown code fences and partial JSON gracefully.
 */
function parseInsightsResponse(responseText: string): InsightItem[] {
  let text = responseText.trim();

  // Strip markdown code fences
  if (text.includes('```json')) {
    text = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    text = text.split('```')[1].split('```')[0].trim();
  }

  // Try to find a JSON array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    text = arrayMatch[0];
  }

  // Also handle the wrapped format { "insights": [...] }
  const objectMatch = text.match(/\{[\s\S]*"insights"\s*:\s*(\[[\s\S]*\])[\s\S]*\}/);
  if (objectMatch) {
    text = objectMatch[1];
  }

  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  // Validate and normalize each insight
  const valid: InsightItem[] = [];
  for (const item of parsed.slice(0, 10)) {
    if (typeof item === 'object' && item !== null && typeof item.text === 'string' && item.text.length > 0) {
      const type = item.type === 'weakness' ? 'weakness' : 'learned';
      valid.push({ type, text: item.text });
    }
  }

  return valid;
}
