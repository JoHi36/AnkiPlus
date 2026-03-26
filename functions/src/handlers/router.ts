/**
 * POST /router
 * Routes user queries to the correct agent and determines retrieval strategy.
 */
import { Request, Response } from 'express';
import * as functions from 'firebase-functions';
import { chatCompletionWithRetry, fetchGenerationCost } from '../utils/openrouter';
import { calculateNormalizedTokens, calculateCostMicrodollars, normalizeFromCost, costToMicrodollars } from '../utils/tokenPricing';
import { debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';

const ROUTER_MODEL = 'gemini-2.5-flash';

export async function routerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { message, cardContext, lastAssistantMessage: _lastAssistantMessage, mode, agentDescriptions } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    // Build compact card hint (keywords only, not full content)
    let cardHint = '';
    if (cardContext && cardContext.cardId) {
      const qClean = (cardContext.question || cardContext.frontField || '')
        .replace(/<[^>]+>/g, ' ')
        .trim()
        .substring(0, 200);
      const deck = cardContext.deckName || '';
      if (qClean) {
        cardHint = `Karte: ${qClean} (Deck: ${deck})\n`;
      }
    }

    const agents = agentDescriptions ||
      'research (externe Quellen), help (App-Hilfe), plusi (persoenlich)';
    const currentMode = mode || 'free_chat';
    const userMsg = (message as string).substring(0, 300);

    const prompt = `Route diese Nachricht zum richtigen Agent. Antworte NUR mit einem JSON-Objekt.

Agenten: tutor (Default, Lernfragen), ${agents}
Regeln: tutor im Zweifel. Andere NUR wenn eindeutig kein Lernthema.

${cardHint}Modus: ${currentMode}
Nachricht: "${userMsg}"

Antwort-Schema:
{"agent":"tutor","search_needed":true,"precise_queries":["keyword1 keyword2"],"broad_queries":["keyword1 OR keyword2"],"search_scope":"current_deck","response_length":"medium"}`;

    const response = await chatCompletionWithRetry({
      model: ROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });

    const text = response.choices?.[0]?.message?.content || '';

    // Track token usage
    const userId = (req as any).userId;
    if (userId && response.usage) {
      const inputTokens = response.usage.prompt_tokens || 0;
      const outputTokens = response.usage.completion_tokens || 0;
      const genCost = response.id ? await fetchGenerationCost(response.id) : null;
      const normalizedTokens = genCost && genCost.totalCost > 0
        ? normalizeFromCost(genCost.totalCost)
        : calculateNormalizedTokens(ROUTER_MODEL, inputTokens, outputTokens);
      const costMicro = genCost && genCost.totalCost > 0
        ? costToMicrodollars(genCost.totalCost)
        : calculateCostMicrodollars(ROUTER_MODEL, inputTokens, outputTokens);
      const date = getCurrentDateString();
      const week = getCurrentWeekString();
      debitTokens(userId, date, week, normalizedTokens, inputTokens, outputTokens, costMicro)
        .catch(err => functions.logger.error('Failed to debit router tokens', err));
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: 'Failed to parse router response' });
      return;
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (error: any) {
    functions.logger.error('Router error:', error);
    res.status(500).json({ error: error.message || 'Router error' });
  }
}
