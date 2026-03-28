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

    const prompt = `You are a message router for a learning app. Your job:
1. Decide which agent handles this message (tutor/research/help/plusi)
2. Decide if a card search is needed
3. If search is needed: write a clear, specific description of what the user wants to know, using domain-specific terminology.

Agents: tutor (default, learning questions), ${agents}
Rules: tutor in doubt. Others ONLY when clearly not a learning topic.

CRITICAL for resolved_intent:
- For context-dependent questions ("what do you mean?", "explain that"):
  Use the card context and recent exchange to determine the SPECIFIC topic.
  Write the intent using actual domain terms, not the user's vague words.
- For standalone questions: Restate with domain-specific precision.
- resolved_intent must be a factual description, NOT a search query.

${cardHint}Mode: ${currentMode}
Message: "${userMsg}"

Output JSON only:
{"agent":"tutor","search_needed":true,"resolved_intent":"clear description of what the user wants to know"}`;

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
