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
  // Correlation id used across all [ROUTER N/5] log entries for this request
  const requestId = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tRouterStart = Date.now();

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

    // ── [ROUTER 1/5] request received ─────────────────────────────────────
    // What did the addon actually send? Confirms card context is present and
    // that the message/card preview match expectations.
    const cardQuestionPreview = ((cardContext?.question || cardContext?.frontField || '') as string)
      .replace(/<[^>]+>/g, ' ')
      .trim()
      .substring(0, 200);
    functions.logger.info('[ROUTER 1/5] request received', {
      requestId,
      userId: (req as any).userId || 'anon',
      hasCardContext: !!(cardContext && cardContext.cardId),
      cardId: cardContext?.cardId,
      cardDeckName: cardContext?.deckName,
      cardQuestionLen: cardQuestionPreview.length,
      cardQuestionPreview,
      messageLen: (message || '').length,
      messagePreview: ((message || '') as string).substring(0, 200),
      mode: mode || 'free_chat',
    });

    const agents = agentDescriptions ||
      'research (externe Quellen), help (App-Hilfe), plusi (persoenlich)';
    const currentMode = mode || 'free_chat';
    const userMsg = (message as string).substring(0, 300);

    const prompt = `You are a message router for a learning app. Your job:
1. Decide which agent handles this message (tutor/research/help/plusi)
2. Decide if a card search is needed
3. If search is needed: write a clear, specific description of what the user wants to know
4. List 5-10 associated domain terms (synonyms, related concepts, parent/child terms)

Agents: tutor (default, learning questions), ${agents}
Rules: tutor in doubt. Others ONLY when clearly not a learning topic.

CRITICAL for resolved_intent:
- For context-dependent questions ("what do you mean?", "explain that"):
  Use the card context and recent exchange to determine the SPECIFIC topic.
  Write the intent using actual domain terms, not the user's vague words.
- For standalone questions: Restate with domain-specific precision.
- resolved_intent must be a factual description, NOT a search query.
- ALWAYS respond in the SAME LANGUAGE as the user's message.

CRITICAL for associated_terms:
- List 5-10 domain-specific terms associated with the topic.
- Include: synonyms, related anatomy/physiology, parent concepts, clinical terms.
- Example: "Wernicke-Zentrum" → ["Broca-Aphasie", "Sprachverständnis", "Temporallappen", "sensorische Aphasie", "Gyrus temporalis superior"]
- These terms are used for card search — be specific, use the user's language.

${cardHint}Mode: ${currentMode}
Message: "${userMsg}"

Output JSON only:
{"agent":"tutor","search_needed":true,"resolved_intent":"clear description","associated_terms":["term1","term2","term3"]}`;

    // ── [ROUTER 2/5] prompt built ─────────────────────────────────────────
    // The full prompt the LLM will see. `provider` makes the OpenRouter-vs-
    // Gemini-API routing choice explicit in the log so future filter queries
    // can distinguish which backend produced which response.
    functions.logger.info('[ROUTER 2/5] prompt built', {
      requestId,
      model: ROUTER_MODEL,
      provider: 'openrouter',
      promptLen: prompt.length,
      cardHintPresent: !!cardHint,
      cardHintPreview: cardHint.substring(0, 300),
      fullPrompt: prompt,
    });

    // ── THE LLM CALL ──────────────────────────────────────────────────────
    let response;
    try {
      response = await chatCompletionWithRetry({
        model: ROUTER_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 512,
        response_format: { type: 'json_object' },
      });
    } catch (llmError: any) {
      functions.logger.error('[ROUTER 3/5] LLM call failed', {
        requestId,
        error: llmError?.message,
        status: llmError?.response?.status,
        data: llmError?.response?.data,
        elapsedMs: Date.now() - tRouterStart,
      });
      throw llmError;
    }

    const tLlmDone = Date.now();
    const text = response.choices?.[0]?.message?.content || '';

    // ── [ROUTER 3/5] LLM response received ────────────────────────────────
    // The raw, unparsed text from OpenRouter. This is the single most
    // important log line for diagnosing intent-quality problems — it shows
    // exactly what the model wrote, before any parsing or interpretation.
    functions.logger.info('[ROUTER 3/5] LLM response received', {
      requestId,
      elapsedMs: tLlmDone - tRouterStart,
      rawResponseLen: text.length,
      rawResponse: text,
      finishReason: response.choices?.[0]?.finish_reason,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      modelUsed: (response as any).model,
      responseId: response.id,
    });

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
      functions.logger.error('[ROUTER 4/5] JSON parse failed — no object in response', {
        requestId,
        rawResponsePreview: text.substring(0, 500),
      });
      res.status(500).json({ error: 'Failed to parse router response' });
      return;
    }

    let result: any;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      functions.logger.error('[ROUTER 4/5] JSON.parse threw', {
        requestId,
        error: parseErr?.message,
        jsonTextPreview: jsonMatch[0].substring(0, 500),
      });
      res.status(500).json({ error: 'Failed to parse router response' });
      return;
    }

    // ── [ROUTER 4/5] parsed ───────────────────────────────────────────────
    // Parsed fields with length/emptiness flags. Separating raw (ROUTER 3)
    // from parsed (ROUTER 4) lets us distinguish JSON-format issues from
    // content-quality issues at a glance.
    functions.logger.info('[ROUTER 4/5] parsed', {
      requestId,
      agent: result.agent,
      search_needed: result.search_needed,
      resolved_intent: result.resolved_intent,
      resolved_intent_len: ((result.resolved_intent as string) || '').length,
      resolved_intent_empty: !result.resolved_intent || !((result.resolved_intent as string) || '').trim(),
      associated_terms: result.associated_terms,
      associated_terms_count: ((result.associated_terms as any[]) || []).length,
      extraFields: Object.keys(result).filter(
        k => !['agent', 'search_needed', 'resolved_intent', 'associated_terms'].includes(k)
      ),
    });

    // ── [ROUTER 5/5] intent quality diagnostic ────────────────────────────
    // Observability only — no behaviour change. Flags suspected failure
    // modes so Cloud Logging can surface them without us having to grep.
    if (cardContext?.cardId) {
      const intent = (((result.resolved_intent as string) || '')).toLowerCase();
      const flags: string[] = [];
      if (!intent.trim()) flags.push('empty_intent');
      if (/\b(karte|lernkarte|card|this|that|dies|diese|dieser|dieses)\b/.test(intent)) {
        flags.push('intent_contains_meta_words');
      }
      const cardQNorm = (((cardContext.question || cardContext.frontField || '') as string))
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase();
      const cardWords = new Set(
        cardQNorm.split(/\s+/).filter(w => w.length > 3 && !/^(der|die|das|ein|eine|sich|sie|ist|sind)$/i.test(w))
      );
      const intentWords = new Set(intent.split(/\s+/).filter(w => w.length > 0));
      const overlap = [...intentWords].filter(w => cardWords.has(w)).length;
      if (overlap === 0 && cardWords.size > 0) flags.push('zero_word_overlap_with_card');

      if (flags.length > 0) {
        functions.logger.warn('[ROUTER 5/5] intent quality flags', {
          requestId,
          flags,
          resolved_intent: result.resolved_intent,
          cardQuestion: ((cardContext.question || cardContext.frontField || '') as string).substring(0, 200),
          overlap,
          cardWordsCount: cardWords.size,
        });
      } else {
        functions.logger.info('[ROUTER 5/5] intent looks healthy', {
          requestId,
          overlap,
          cardWordsCount: cardWords.size,
        });
      }
    } else {
      functions.logger.info('[ROUTER 5/5] no card context — skipping intent diagnostic', {
        requestId,
      });
    }

    res.json(result);
  } catch (error: any) {
    functions.logger.error('Router error:', { requestId, error: error?.message, stack: error?.stack });
    res.status(500).json({ error: error.message || 'Router error' });
  }
}
