/**
 * POST /router
 * Routes user queries to determine retrieval strategy (sql, semantic, both).
 */
import { Request, Response } from 'express';
import * as functions from 'firebase-functions';
import { geminiPost } from '../utils/geminiClient';
import { calculateNormalizedTokens, calculateCostMicrodollars } from '../utils/tokenPricing';
import { debitTokens, getCurrentDateString, getCurrentWeekString } from '../utils/firestore';

const ROUTER_MODEL = 'gemini-2.5-flash';

export async function routerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { message, cardContext, lastAssistantMessage } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || functions.config().google?.ai_api_key;
    if (!apiKey) {
      res.status(500).json({ error: 'Gemini API key not configured' });
      return;
    }

    // Build context info from card
    let contextInfo = '';
    if (cardContext) {
      contextInfo = `\nKarten-Kontext:\n- Frage: ${cardContext.question || ''}\n- Antwort: ${cardContext.answer || ''}\n- Deck: ${cardContext.deckName || ''}\n- Tags: ${(cardContext.tags || []).join(', ')}`;
    }
    if (lastAssistantMessage) {
      contextInfo += `\nLetzte Antwort: "${lastAssistantMessage.substring(0, 200)}"`;
    }

    const prompt = `Du bist ein Such-Router für eine Lernkarten-App. Entscheide ob und wie gesucht werden soll.

Benutzer-Nachricht: "${message}"${contextInfo}

Antworte NUR mit JSON:
{
  "search_needed": true/false,
  "retrieval_mode": "sql|semantic|both",
  "embedding_query": "semantisch reicher Suchtext",
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck|collection"
}

REGELN:
- search_needed=false bei Smalltalk, Danke, Meta-Fragen
- embedding_query: Synthese aus Karteninhalt + Benutzerfrage. NIEMALS Benutzerfrage wörtlich verwenden.
- precise_queries: 2-3 AND-Queries aus Karten-Keywords
- broad_queries: 2-3 OR-Queries für breitere Suche
- search_scope: "current_deck" als Default
- retrieval_mode: "both" als Default`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${ROUTER_MODEL}:generateContent?key=${apiKey}`;

    const response = await geminiPost(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    // Track token usage
    const userId = (req as any).userId;
    if (userId) {
      const usageMetadata = response.data?.usageMetadata;
      if (usageMetadata) {
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        const normalizedTokens = calculateNormalizedTokens(ROUTER_MODEL, inputTokens, outputTokens);
        const costMicro = calculateCostMicrodollars(ROUTER_MODEL, inputTokens, outputTokens);
        const date = getCurrentDateString();
        const week = getCurrentWeekString();
        debitTokens(userId, date, week, normalizedTokens, inputTokens, outputTokens, costMicro)
          .catch(err => functions.logger.error('Failed to debit router tokens', err));
      }
    }

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
