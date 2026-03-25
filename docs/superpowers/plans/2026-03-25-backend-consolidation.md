# Backend Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all paid API calls to the Firebase backend via OpenRouter, protect system prompts as server-side IP.

**Architecture:** Client sends message + card context to backend. Backend builds system prompt, calls OpenRouter, streams response back. Client never sees API keys or prompts. Agent loop stays client-side; each LLM turn goes through backend.

**Tech Stack:** Firebase Cloud Functions (TypeScript/Express), OpenRouter API, Python client (requests library)

**Spec:** `docs/superpowers/specs/2026-03-25-backend-consolidation-design.md`

---

## Phase 1: Backend Expansion

All tasks in Phase 1 are additive — existing Gemini endpoints continue working. Nothing breaks until Phase 2.

### Task 1: OpenRouter Client Module

**Files:**
- Create: `functions/src/utils/openrouter.ts`

- [ ] **Step 1: Create OpenRouter client with model mapping**

```typescript
// functions/src/utils/openrouter.ts
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as functions from 'firebase-functions';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Internal model names → OpenRouter model IDs
export const MODEL_MAP: Record<string, string> = {
  'gemini-3-flash-preview': 'google/gemini-2.5-flash',
  'gemini-3.0-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
  'perplexity-sonar': 'perplexity/sonar',
};

const client: AxiosInstance = axios.create({
  baseURL: OPENROUTER_BASE,
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY || functions.config().openrouter?.api_key || '';
  if (!key) throw new Error('OPENROUTER_API_KEY not configured');
  return key;
}

export function resolveModel(internalName: string): string {
  return MODEL_MAP[internalName] || internalName;
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: string };
}

export async function chatCompletion(req: OpenRouterRequest) {
  const apiKey = getApiKey();
  return client.post('/chat/completions', req, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    responseType: req.stream ? 'stream' : 'json',
  });
}

// Retry wrapper for transient errors
export async function chatCompletionWithRetry(
  req: OpenRouterRequest,
  maxRetries = 3,
): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(req);
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      if (status && [429, 500, 502, 503].includes(status) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: Set OpenRouter API key as Firebase secret**

```bash
cd functions
firebase functions:secrets:set OPENROUTER_API_KEY
# Paste your OpenRouter API key when prompted
```

Also update `functions/src/index.ts` to declare the secret if using Firebase Functions v2, or set it via `firebase functions:config:set openrouter.api_key="sk-..."` for v1.

- [ ] **Step 3: Commit**

```bash
git add functions/src/utils/openrouter.ts
git commit -m "feat(backend): add OpenRouter client module with model mapping and retry"
```

---

### Task 2: System Prompt Module in Backend

**Files:**
- Create: `functions/src/prompts/tutor.ts`
- Create: `functions/src/prompts/plusi.ts`
- Create: `functions/src/prompts/help.ts`
- Create: `functions/src/prompts/research.ts`
- Create: `functions/src/utils/systemPrompt.ts`
- Read: `ai/system_prompt.py` (source of truth for tutor prompt)
- Read: `plusi/agent.py` (source for plusi prompts)
- Read: `ai/help_agent.py` (source for help prompt)

- [ ] **Step 1: Copy tutor prompt from `ai/system_prompt.py` lines 6-90**

Create `functions/src/prompts/tutor.ts` with the full `SYSTEM_PROMPT` and `HANDOFF_SECTION` constants translated to TypeScript string literals. Keep the prompt text identical (German).

```typescript
// functions/src/prompts/tutor.ts
export const TUTOR_PROMPT = `...`; // Copy from ai/system_prompt.py SYSTEM_PROMPT
export const HANDOFF_SECTION = `...`; // Copy from ai/system_prompt.py HANDOFF_SECTION
```

- [ ] **Step 2: Copy plusi prompts from `plusi/agent.py`**

Create `functions/src/prompts/plusi.ts`. The Plusi agent has multiple prompt modes (chat, browse, card digest). Copy all PLUSI_SYSTEM_PROMPT variants.

```typescript
// functions/src/prompts/plusi.ts
export const PLUSI_CHAT_PROMPT = `...`;
export const PLUSI_BROWSE_PROMPT = `...`;
export const PLUSI_CARD_DIGEST_PROMPT = `...`;
```

- [ ] **Step 3: Copy help and research prompts**

Create `functions/src/prompts/help.ts` and `functions/src/prompts/research.ts` from their respective Python source files.

- [ ] **Step 4: Create systemPrompt builder**

```typescript
// functions/src/utils/systemPrompt.ts
import { TUTOR_PROMPT, HANDOFF_SECTION } from '../prompts/tutor';
import { PLUSI_CHAT_PROMPT } from '../prompts/plusi';
import { HELP_PROMPT } from '../prompts/help';
import { RESEARCH_PROMPT } from '../prompts/research';

export interface PromptParams {
  agent: 'tutor' | 'research' | 'help' | 'plusi';
  cardContext?: {
    question?: string;
    answer?: string;
    deckName?: string;
    tags?: string[];
    stats?: { knowledgeScore?: number; reps?: number; lapses?: number; interval?: number };
  };
  insights?: string[];
  mode?: 'review' | 'free_chat';
  responseStyle?: 'compact' | 'detailed';
  tools?: string[];
  plusiMode?: 'chat' | 'browse' | 'card_digest';
}

export function buildSystemPrompt(params: PromptParams): string {
  const { agent, cardContext, insights, mode, responseStyle, tools, plusiMode } = params;

  // Select base prompt by agent
  let prompt: string;
  switch (agent) {
    case 'tutor':
      prompt = TUTOR_PROMPT;
      break;
    case 'plusi':
      prompt = PLUSI_CHAT_PROMPT; // Select by plusiMode if needed
      break;
    case 'help':
      prompt = HELP_PROMPT;
      break;
    case 'research':
      prompt = RESEARCH_PROMPT;
      break;
    default:
      prompt = TUTOR_PROMPT;
  }

  // Inject insights (tutor only)
  if (agent === 'tutor' && insights && insights.length > 0) {
    const insightBlock = insights.map(i => `- ${i}`).join('\n');
    prompt += `\n\n## Bekannte Schwächen des Lernenden\n${insightBlock}`;
  }

  // Inject handoff section (tutor only)
  if (agent === 'tutor') {
    prompt += '\n\n' + HANDOFF_SECTION;
  }

  // Inject response style
  if (responseStyle === 'detailed') {
    prompt += '\n\nAntworte ausführlich mit Erklärungen und Beispielen.';
  }

  return prompt;
}
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/prompts/ functions/src/utils/systemPrompt.ts
git commit -m "feat(backend): add system prompt builder with all agent prompts"
```

---

### Task 3: Rewrite /chat Endpoint for OpenRouter

**Files:**
- Modify: `functions/src/handlers/chat.ts`
- Read: `functions/src/utils/openrouter.ts` (from Task 1)
- Read: `functions/src/utils/systemPrompt.ts` (from Task 2)

This is the biggest single task. The current `chat.ts` calls Gemini directly. It needs to:
1. Accept the expanded request body (with `agent`, `cardContext`, `insights`, etc.)
2. Build system prompt via `buildSystemPrompt()`
3. Call OpenRouter instead of Gemini
4. Translate OpenRouter's SSE format to the existing client format

- [ ] **Step 1: Update request body validation**

Add new optional fields to the request validation at the top of `chatHandler`. The existing fields (`message`, `history`, `model`, `stream`, `temperature`, `maxOutputTokens`) stay. New fields:

```typescript
const {
  message, history, context, model, mode, stream, temperature, maxOutputTokens,
  // New fields:
  agent = 'tutor',
  cardContext,
  insights,
  responseStyle = 'compact',
  tools,
} = req.body;
```

- [ ] **Step 2: Add system prompt assembly**

After quota check, before API call, add:

```typescript
import { buildSystemPrompt } from '../utils/systemPrompt';

const systemPrompt = buildSystemPrompt({
  agent: agent as any,
  cardContext: cardContext || context, // backward compat: old clients send 'context'
  insights,
  mode: mode as any,
  responseStyle: responseStyle as any,
  tools,
});
```

- [ ] **Step 3: Replace Gemini API call with OpenRouter**

Replace the Gemini URL construction and fetch with:

```typescript
import { chatCompletionWithRetry, resolveModel, OpenRouterMessage } from '../utils/openrouter';

// Build messages array
const messages: OpenRouterMessage[] = [
  { role: 'system', content: systemPrompt },
];

// Add history
if (history && Array.isArray(history)) {
  for (const msg of history) {
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }
}

// Add current message
messages.push({ role: 'user', content: enhancedMessage });

const orResponse = await chatCompletionWithRetry({
  model: resolveModel(selectedModel),
  messages,
  temperature: temperature ?? 0.7,
  max_tokens: maxOutputTokens ?? 8192,
  stream: shouldStream,
});
```

- [ ] **Step 4: Translate streaming response format**

OpenRouter streams OpenAI-format SSE. The client expects `{ text: "..." }` chunks. Add translation:

```typescript
if (shouldStream) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = orResponse.data;
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  stream.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
        }
        // Capture usage from final chunk
        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens || 0;
          outputTokens = parsed.usage.completion_tokens || 0;
        }
      } catch { /* skip malformed chunks */ }
    }
  });

  stream.on('end', async () => {
    // Debit tokens (reuse existing debitTokens logic)
    // ... existing token debit code ...
    res.write(`data: ${JSON.stringify({ done: true, tokens: { used: normalizedTokens, dailyRemaining, weeklyRemaining } })}\n\n`);
    res.end();
  });

  stream.on('error', (err: Error) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });
}
```

- [ ] **Step 5: Add tool/function-calling format translation**

The agent loop (`ai/agent_loop.py`) sends tool definitions and expects function-call responses in **Gemini format**. OpenRouter uses **OpenAI format**. The backend must translate both directions.

Add a translation module:

```typescript
// functions/src/utils/toolTranslation.ts

// Gemini tool format → OpenAI tool format
export function geminiToolsToOpenAI(geminiTools: any[]): any[] {
  if (!geminiTools || !geminiTools.length) return [];
  // Gemini: [{ functionDeclarations: [{ name, description, parameters }] }]
  // OpenAI: [{ type: 'function', function: { name, description, parameters } }]
  const tools: any[] = [];
  for (const toolGroup of geminiTools) {
    for (const fn of (toolGroup.functionDeclarations || [])) {
      tools.push({
        type: 'function',
        function: { name: fn.name, description: fn.description, parameters: fn.parameters },
      });
    }
  }
  return tools;
}

// OpenAI function-call response → Gemini functionCall format
export function openAIFunctionCallToGemini(choice: any): any {
  // OpenAI: choice.message.tool_calls[{ id, function: { name, arguments } }]
  // Gemini: parts[{ functionCall: { name, args } }]
  const toolCalls = choice.message?.tool_calls;
  if (!toolCalls || !toolCalls.length) return null;
  return {
    role: 'model',
    parts: toolCalls.map((tc: any) => ({
      functionCall: {
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      },
    })),
  };
}

// Gemini functionResponse → OpenAI tool message
export function geminiFunctionResponseToOpenAI(geminiMsg: any): any[] {
  // Gemini: { role: 'function', parts: [{ functionResponse: { name, response } }] }
  // OpenAI: { role: 'tool', tool_call_id: '...', content: '...' }
  const messages: any[] = [];
  for (const part of (geminiMsg.parts || [])) {
    if (part.functionResponse) {
      messages.push({
        role: 'tool',
        tool_call_id: part.functionResponse.name, // Use name as ID
        content: JSON.stringify(part.functionResponse.response || {}),
      });
    }
  }
  return messages;
}
```

In `chat.ts`, use this translation when the request includes `tools` or `functionResponse` in history:

```typescript
import { geminiToolsToOpenAI, geminiFunctionResponseToOpenAI, openAIFunctionCallToGemini } from '../utils/toolTranslation';

// When building messages, translate Gemini function messages
if (history) {
  for (const msg of history) {
    if (msg.role === 'function' && msg.parts) {
      // Gemini functionResponse → OpenAI tool messages
      messages.push(...geminiFunctionResponseToOpenAI(msg));
    } else if (msg.role === 'model' && msg.parts?.some((p: any) => p.functionCall)) {
      // Gemini model functionCall → OpenAI assistant with tool_calls
      messages.push({
        role: 'assistant',
        tool_calls: msg.parts.filter((p: any) => p.functionCall).map((p: any) => ({
          id: p.functionCall.name,
          type: 'function',
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
        })),
      });
    } else {
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    }
  }
}

// Translate tools if provided
if (tools_definitions) {
  orRequest.tools = geminiToolsToOpenAI(tools_definitions);
}
```

When returning a function-call response to the client, translate back to Gemini format:

```typescript
// In non-streaming response
const choice = response.data.choices?.[0];
if (choice?.message?.tool_calls) {
  // Return Gemini-format functionCall for agent loop
  res.json(openAIFunctionCallToGemini(choice));
} else {
  res.json({ text: choice?.message?.content || '' });
}
```

- [ ] **Step 6: Keep backward compatibility**

The old request format (with `context` instead of `cardContext`) must still work. Map:
```typescript
const effectiveCardContext = cardContext || (context ? {
  question: context.question,
  answer: context.answer,
  stats: context.stats,
} : undefined);
```

- [ ] **Step 6: Test with curl**

```bash
# Non-streaming test
curl -X POST https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Was ist Mitose?","agent":"tutor","stream":false}'

# Streaming test
curl -X POST https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Was ist Mitose?","agent":"tutor","stream":true}' \
  --no-buffer
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/handlers/chat.ts
git commit -m "feat(backend): rewrite /chat to use OpenRouter with server-side system prompts"
```

---

### Task 4: Rewrite /router Endpoint for OpenRouter

**Files:**
- Modify: `functions/src/handlers/router.ts`
- Read: `ai/router.py` lines 220-260 (current router prompt)

- [ ] **Step 1: Move router prompt to backend**

Replace the current German router prompt in `router.ts` with the compact version from `ai/router.py` (the one starting with "Route diese Nachricht zum richtigen Agent").

- [ ] **Step 2: Replace Gemini call with OpenRouter**

```typescript
import { chatCompletionWithRetry, resolveModel } from '../utils/openrouter';

const response = await chatCompletionWithRetry({
  model: resolveModel('gemini-2.5-flash'),
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.0,
  max_tokens: 512,
  response_format: { type: 'json_object' },
});

const text = response.data.choices?.[0]?.message?.content || '';
const parsed = JSON.parse(text);
```

- [ ] **Step 3: Update token debit to use OpenRouter usage**

```typescript
const usage = response.data.usage;
if (usage && userId) {
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  // ... existing debit logic ...
}
```

- [ ] **Step 4: Test**

```bash
curl -X POST https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/router \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message":"Was ist ATP?","cardContext":{"question":"ATP","deckName":"Biochemie"}}'
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/router.ts
git commit -m "feat(backend): rewrite /router to use OpenRouter"
```

---

### Task 5: New /research Endpoint

**Files:**
- Create: `functions/src/handlers/research.ts`
- Modify: `functions/src/index.ts` (register route)
- Read: `research/openrouter.py` (current implementation)

- [ ] **Step 1: Create research handler**

```typescript
// functions/src/handlers/research.ts
import { Request, Response } from 'express';
import { chatCompletionWithRetry } from '../utils/openrouter';
import { debitTokens } from '../utils/firestore';
import { calculateNormalizedTokens } from '../utils/tokenPricing';

export async function researchHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query, model = 'perplexity/sonar' } = req.body;
    const userId = (req as any).userId;

    if (!query) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'query required' } });
      return;
    }

    const response = await chatCompletionWithRetry({
      model, // perplexity/sonar includes web search + citations
      messages: [{ role: 'user', content: query }],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const content = response.data.choices?.[0]?.message?.content || '';
    const citations = response.data.citations || []; // Perplexity Sonar returns citations
    const usage = response.data.usage;

    // Debit tokens
    if (userId && usage) {
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;
      const normalized = calculateNormalizedTokens('perplexity-sonar', inputTokens, outputTokens);
      const { getCurrentDateString, getCurrentWeekString } = require('../utils/firestore');
      const date = getCurrentDateString();
      const week = getCurrentWeekString();
      await debitTokens(userId, date, week, normalized, inputTokens, outputTokens, 0);
    }

    res.json({ answer: content, citations });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'BACKEND_ERROR', message: err.message } });
  }
}
```

- [ ] **Step 2: Register route in index.ts**

Add after the existing `/router` route:

```typescript
import { researchHandler } from './handlers/research';
app.post('/research', validateToken, researchHandler);
```

- [ ] **Step 3: Update tokenPricing.ts MODEL_RATES**

Add OpenRouter model rates and alias existing models:

```typescript
export const MODEL_RATES: Record<string, { input: number; output: number }> = {
  // Existing (keep for backward compat during transition)
  'gemini-3.0-flash':          { input: 0.50, output: 3.00 },
  'gemini-3-flash-preview':    { input: 0.50, output: 3.00 },
  'gemini-2.5-flash':          { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite':     { input: 0.10, output: 0.40 },
  // OpenRouter model IDs (same rates, different keys)
  'google/gemini-2.5-flash':       { input: 0.30, output: 2.50 },
  'google/gemini-2.5-flash-lite':  { input: 0.10, output: 0.40 },
  // Research
  'perplexity-sonar':          { input: 1.00, output: 1.00 },
  'perplexity/sonar':          { input: 1.00, output: 1.00 },
};
```

- [ ] **Step 4: Test**

```bash
curl -X POST https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/research \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query":"What are the latest findings on neuroplasticity?"}'
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/research.ts functions/src/index.ts functions/src/utils/tokenPricing.ts
git commit -m "feat(backend): add /research endpoint for Perplexity Sonar via OpenRouter"
```

---

### Task 6: New /insights/extract Endpoint

**Files:**
- Create: `functions/src/handlers/insights.ts`
- Modify: `functions/src/index.ts` (register route)
- Read: `storage/insights.py` lines 140-210 (current implementation)

- [ ] **Step 1: Create insights handler**

```typescript
// functions/src/handlers/insights.ts
import { Request, Response } from 'express';
import { chatCompletionWithRetry, resolveModel } from '../utils/openrouter';

export async function insightsExtractHandler(req: Request, res: Response): Promise<void> {
  try {
    const { messages, cardContext } = req.body;
    const userId = (req as any).userId;

    if (!messages || !messages.length) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'messages required' } });
      return;
    }

    // Build extraction prompt (from storage/insights.py)
    const prompt = `Analysiere diesen Chat-Verlauf und extrahiere Lern-Insights.
Für jede Erkenntnis, gib den Typ an: "learned" (verstanden) oder "weakness" (Schwäche/Lücke).

Chat-Verlauf:
${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

${cardContext ? `Karte: ${cardContext.question || ''}\nAntwort: ${cardContext.answer || ''}` : ''}

Antworte als JSON-Array:
[{"type": "learned"|"weakness", "text": "..."}]`;

    const response = await chatCompletionWithRetry({
      model: resolveModel('gemini-2.5-flash'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.data.choices?.[0]?.message?.content || '[]';
    let insights;
    try {
      insights = JSON.parse(content);
      if (!Array.isArray(insights)) insights = [insights];
    } catch {
      insights = [];
    }

    // Debit tokens (lightweight — skip if usage unavailable)
    // ... similar to research handler ...

    res.json({ insights });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'BACKEND_ERROR', message: err.message } });
  }
}
```

- [ ] **Step 2: Register route in index.ts**

```typescript
import { insightsExtractHandler } from './handlers/insights';
app.post('/insights/extract', validateToken, insightsExtractHandler);
```

- [ ] **Step 3: Test and commit**

```bash
git add functions/src/handlers/insights.ts functions/src/index.ts
git commit -m "feat(backend): add /insights/extract endpoint via OpenRouter"
```

---

### Task 7: Deploy and Verify Phase 1

**Files:** None (deployment + testing only)

- [ ] **Step 1: Build and deploy**

```bash
cd functions
npm run build
firebase deploy --only functions
```

- [ ] **Step 2: Verify all existing endpoints still work**

Test `/chat` (old format without agent field), `/router`, `/embed`, `/models`, `/user/quota` — all must return same responses as before.

- [ ] **Step 3: Verify new endpoints work**

Test `/chat` (new format with `agent` field), `/research`, `/insights/extract`.

- [ ] **Step 4: Tag release**

```bash
git tag phase1-backend-complete
git push origin phase1-backend-complete
```

---

## Phase 2: Client Migration

Each task removes direct API calls from one Python module and routes through the backend instead. Run `python3 run_tests.py` after each task.

**Before starting Phase 2, tag the current state:**
```bash
git tag phase2-start
```

### Task 8: Migrate ai/router.py (Backend /router only)

**Files:**
- Modify: `ai/router.py`

Migrate the router first — it's called before every chat request, so getting this right validates the backend connection.

- [ ] **Step 1: Replace `unified_route()` LLM call with backend /router**

In `ai/router.py`, the `unified_route()` function (line ~161) currently builds a prompt and calls Gemini directly (lines 248-260). Replace with a backend call:

```python
def unified_route(user_message, session_context, config,
                  card_context=None, chat_history=None):
    """Level 3: LLM routing via backend."""
    try:
        from ..config import get_backend_url, get_auth_token
    except ImportError:
        from config import get_backend_url, get_auth_token

    auth_token = get_auth_token()
    backend_url = get_backend_url()

    if not auth_token or not backend_url:
        # No backend auth — return default tutor with search
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='No backend auth',
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')

    try:
        headers = {
            'Authorization': 'Bearer %s' % auth_token,
            'Content-Type': 'application/json',
        }
        payload = {
            'message': user_message[:500],
            'cardContext': card_context or {},
            'lastAssistantMessage': '',
        }
        if chat_history and len(chat_history) > 0:
            last = chat_history[-1]
            if isinstance(last, dict) and last.get('role') == 'assistant':
                payload['lastAssistantMessage'] = (last.get('content') or '')[:300]

        resp = _requests.post('%s/router' % backend_url, json=payload,
                              headers=headers, timeout=_LLM_TIMEOUT_SECONDS)
        resp.raise_for_status()
        parsed = resp.json()

        agent = parsed.get('agent', 'tutor').lower()
        # Validate agent exists
        try:
            from ..ai.agents import get_agent_registry
        except ImportError:
            from ai.agents import get_agent_registry
        registry = get_agent_registry() or {}
        valid_agents = {'tutor'} | set(registry.keys())
        if agent not in valid_agents:
            agent = 'tutor'

        return UnifiedRoutingResult(
            agent=agent, method='llm',
            reasoning=parsed.get('reasoning', ''),
            search_needed=parsed.get('search_needed', True),
            retrieval_mode=parsed.get('retrieval_mode', 'both'),
            response_length=parsed.get('response_length', 'medium'),
            max_sources=parsed.get('max_sources', 'medium'),
            search_scope=parsed.get('search_scope', 'current_deck'),
            precise_queries=parsed.get('precise_queries'),
            broad_queries=parsed.get('broad_queries'),
            embedding_queries=parsed.get('embedding_queries'),
        )
    except Exception as e:
        logger.warning("Backend router call failed: %s", e)
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='Backend router failed: %s' % e,
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')
```

- [ ] **Step 2: Remove the router prompt, `_recover_partial_json()`, and direct Gemini imports**

Delete the large prompt string (lines ~220-250) and the `_recover_partial_json()` helper. Remove the `generativelanguage.googleapis.com` URL construction.

- [ ] **Step 3: Keep heuristic routing (Level 1/2)**

`_check_lock_mode()`, `_detect_agent_mention()`, `_check_heuristics()` stay unchanged — they need no LLM call.

- [ ] **Step 4: Run tests**

```bash
python3 run_tests.py -v
```

- [ ] **Step 5: Commit**

```bash
git add ai/router.py
git commit -m "refactor(client): route LLM routing through backend /router endpoint"
```

---

### Task 9: Rewrite ai/gemini.py (Backend-only calls)

**Files:**
- Modify: `ai/gemini.py`

This is the largest client change. Remove all 13+ direct Gemini API calls. Keep only backend HTTP logic.

- [ ] **Step 1: Strip all direct API URL construction**

Remove `_get_api_url()`, `_build_gemini_url()`, all `generativelanguage.googleapis.com` references, and the `retry_with_backoff()` wrapper (backend handles retries).

- [ ] **Step 2: Simplify `get_google_response()`**

Replace the entire function body with a backend-only call:

```python
def get_google_response(user_message, model, api_key=None, context=None,
                        history=None, mode='compact', rag_context=None,
                        system_prompt_override=None, config=None):
    """Non-streaming response via backend /chat."""
    cfg = config or _get_config()
    backend_url = _get_backend_url(cfg)
    auth_token = _get_auth_token(cfg)

    if not backend_url or not auth_token:
        # Dev bypass
        dev_key = cfg.get('dev_openrouter_key', '')
        if dev_key:
            return _dev_openrouter_call(user_message, model, dev_key, context, history, mode)
        return {"error": "Nicht authentifiziert. Bitte melde dich an.", "error_code": "AUTH_REQUIRED"}

    headers = _get_auth_headers(auth_token, cfg)
    payload = _build_chat_payload(user_message, model, context, history, mode,
                                   rag_context, system_prompt_override, stream=False)

    try:
        resp = requests.post('%s/chat' % backend_url, json=payload,
                             headers=headers, timeout=60)
        if resp.status_code == 200:
            data = resp.json()
            return {"text": data.get("text", ""), "tokens": data.get("tokens")}
        else:
            return _handle_backend_error(resp)
    except requests.exceptions.Timeout:
        return {"error": "Server-Timeout. Bitte versuche es erneut.", "error_code": "TIMEOUT"}
    except Exception as e:
        logger.error("Backend chat error: %s", e)
        return {"error": "Verbindungsfehler: %s" % str(e), "error_code": "CONNECTION_ERROR"}
```

- [ ] **Step 3: Simplify `get_google_response_streaming()`**

Same pattern but with SSE stream reading:

```python
def get_google_response_streaming(user_message, model, api_key=None, context=None,
                                   history=None, mode='compact', callback=None,
                                   rag_context=None, suppress_error_callback=False,
                                   system_prompt_override=None, config=None):
    """Streaming response via backend /chat."""
    cfg = config or _get_config()
    backend_url = _get_backend_url(cfg)
    auth_token = _get_auth_token(cfg)

    if not backend_url or not auth_token:
        dev_key = cfg.get('dev_openrouter_key', '')
        if dev_key:
            return _dev_openrouter_streaming(user_message, model, dev_key, context,
                                              history, mode, callback)
        return {"error": "Nicht authentifiziert.", "error_code": "AUTH_REQUIRED"}

    headers = _get_auth_headers(auth_token, cfg)
    payload = _build_chat_payload(user_message, model, context, history, mode,
                                   rag_context, system_prompt_override, stream=True)

    try:
        resp = requests.post('%s/chat' % backend_url, json=payload,
                             headers=headers, timeout=120, stream=True)
        if resp.status_code != 200:
            return _handle_backend_error(resp)

        full_text = ''
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith('data: '):
                continue
            data_str = line[6:]
            try:
                data = json.loads(data_str)
                if data.get('done'):
                    break
                if data.get('error'):
                    return {"error": data['error'], "error_code": "BACKEND_ERROR"}
                text_chunk = data.get('text', '')
                if text_chunk:
                    full_text += text_chunk
                    if callback:
                        callback(text_chunk)
            except json.JSONDecodeError:
                continue

        return {"text": full_text}
    except Exception as e:
        logger.error("Backend streaming error: %s", e)
        return {"error": str(e), "error_code": "CONNECTION_ERROR"}
```

- [ ] **Step 4: Add helper functions**

```python
def _build_chat_payload(user_message, model, context, history, mode,
                         rag_context, system_prompt_override, stream,
                         agent='tutor', insights=None, tools_definitions=None):
    """Build the request payload for backend /chat.

    The `agent` parameter is passed down from handler.py's _dispatch_agent(),
    which knows which agent was selected by the router.
    """
    payload = {
        'message': user_message,
        'model': model,
        'stream': stream,
        'mode': mode,
        'agent': agent,
    }
    if insights:
        payload['insights'] = insights
    if context:
        payload['cardContext'] = context
    if history:
        payload['history'] = [
            {'role': m.get('role', 'user'), 'content': m.get('content', '')}
            for m in history if isinstance(m, dict)
        ]
    if rag_context:
        # Inject RAG context into message (backend doesn't know about RAG)
        payload['message'] = '%s\n\nKontext:\n%s' % (user_message, rag_context)
    return payload

def _get_auth_headers(auth_token, config):
    headers = {'Content-Type': 'application/json'}
    if auth_token:
        headers['Authorization'] = 'Bearer %s' % auth_token
    device_id = config.get('device_id', '')
    if device_id:
        headers['X-Device-Id'] = device_id
    return headers

def _handle_backend_error(resp):
    """Parse backend error response into user-friendly dict."""
    try:
        data = resp.json()
        err = data.get('error', {})
        code = err.get('code', 'BACKEND_ERROR')
        msg = err.get('message', 'Serverfehler')
        if code == 'QUOTA_EXCEEDED':
            return {"error": msg, "error_code": "QUOTA_EXCEEDED",
                    "details": err.get('details')}
        return {"error": msg, "error_code": code}
    except Exception:
        return {"error": "Serverfehler (%d)" % resp.status_code, "error_code": "BACKEND_ERROR"}
```

- [ ] **Step 5: Add dev-only bypass**

```python
def _dev_openrouter_call(user_message, model, dev_key, context, history, mode):
    """DEV ONLY: Direct OpenRouter call for local testing."""
    logger.warning("⚠️ DEV MODE: Using direct OpenRouter key (not for production)")
    # ... minimal OpenRouter implementation ...
```

- [ ] **Step 6: Run tests**

```bash
python3 run_tests.py -v
```

- [ ] **Step 7: Commit**

```bash
git add ai/gemini.py
git commit -m "refactor(client): rewrite gemini.py to backend-only calls, remove all direct API access"
```

---

### Task 10: Migrate Remaining Client Files

**Files:**
- Modify: `ai/rag.py` — Remove direct Gemini call (lines 426-427)
- Modify: `ai/rag_pipeline.py` — Check for and remove any direct API calls
- Modify: `ai/embeddings.py` — Remove direct API fallback
- Modify: `ai/models.py` — Remove direct API calls
- Modify: `ai/help_agent.py` — Remove direct API fallback
- Modify: `ai/tutor.py` — Check for and remove any direct API calls
- Modify: `plusi/agent.py` — Remove 2 direct Gemini calls
- Modify: `research/search.py` — Remove ALL direct API calls (Gemini + OpenRouter)

**Important:** After this task, anonymous users (no auth token) will get an error instead of a response. This is intentional — anonymous access is handled by `validateTokenOptional` in the backend via `X-Device-Id` header. The client's `_get_auth_headers()` helper (Task 9) already sends `X-Device-Id`, so anonymous quota continues to work through the backend.

- [ ] **Step 1: ai/rag.py — Remove direct Gemini calls**

Lines 426-427 have a direct Gemini API call for query analysis. Replace with backend `/router` call or remove (the backend router now handles this).

- [ ] **Step 2: ai/embeddings.py — Remove direct API fallback**

In `embed_texts()` (line 77), remove the direct API fallback path (lines 98-127). Keep only the backend call path (lines 84-96). Remove `_backend_failed` flag logic — if backend fails, propagate the error.

- [ ] **Step 3: ai/models.py — Remove direct Gemini model list**

Remove the direct `v1beta/models?key=` call. Keep only the backend `/models` call. For section title generation, route through backend `/chat` with a short prompt.

- [ ] **Step 4: ai/help_agent.py — Remove direct fallback**

Remove the direct Gemini API fallback (line ~144). Route all calls through backend `/chat` with `agent: 'help'`.

- [ ] **Step 5: plusi/agent.py — Remove direct Gemini calls**

Replace the 2 `_gemini_call()` instances with backend `/chat` calls using `agent: 'plusi'`.

- [ ] **Step 6: research/search.py — Remove direct Gemini call**

Remove the direct Gemini API call at line 139. Route through backend `/chat` for summarization.

- [ ] **Step 7: Run tests**

```bash
python3 run_tests.py -v
```

- [ ] **Step 8: Commit**

```bash
git add ai/rag.py ai/embeddings.py ai/models.py ai/help_agent.py plusi/agent.py research/search.py
git commit -m "refactor(client): migrate all remaining modules to backend-only calls"
```

---

### Task 11: Migrate Research & Insights

**Files:**
- Modify: `research/openrouter.py` — Replace direct OpenRouter with backend `/research`
- Delete: `research/perplexity.py` — No longer needed
- Modify: `storage/insights.py` — Replace direct OpenRouter with backend `/insights/extract`

- [ ] **Step 1: Rewrite research/openrouter.py**

Replace the direct OpenRouter call (lines 45-57) with a backend call:

```python
def search_with_sonar(query, config=None):
    """Research via backend /research endpoint."""
    cfg = config or _get_config()
    backend_url = _get_backend_url(cfg)
    auth_token = _get_auth_token(cfg)

    if not backend_url or not auth_token:
        return {"error": "Not authenticated"}

    headers = {'Authorization': 'Bearer %s' % auth_token, 'Content-Type': 'application/json'}
    resp = requests.post('%s/research' % backend_url, json={'query': query},
                         headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return {"answer": data.get("answer", ""), "citations": data.get("citations", [])}
```

- [ ] **Step 2: Delete research/perplexity.py**

```bash
git rm research/perplexity.py
```

- [ ] **Step 3: Rewrite storage/insights.py extraction**

Replace the direct OpenRouter call (lines 167-178) with a backend call to `/insights/extract`.

- [ ] **Step 4: Run tests and commit**

```bash
python3 run_tests.py -v
git add research/openrouter.py storage/insights.py
git rm research/perplexity.py
git commit -m "refactor(client): migrate research and insights to backend endpoints"
```

---

### Task 12: Config Cleanup & System Prompt Removal

**Files:**
- Modify: `config.py` — Remove API key defaults
- Delete: `ai/system_prompt.py` — Moved to backend
- Modify: `ai/handler.py` — Remove system prompt assembly
- Modify: `frontend/src/components/SettingsSidebar.jsx` — Remove API key inputs

- [ ] **Step 1: config.py — Remove API keys, add dev key**

In `DEFAULT_CONFIG` (line 18):
- Remove `"api_key": ""`
- Remove `"openrouter_api_key": ""`
- Add `"dev_openrouter_key": ""` (not shown in UI)

- [ ] **Step 2: Delete ai/system_prompt.py**

```bash
git rm ai/system_prompt.py
```

Update all imports that reference it. Files that import `system_prompt`:
- `ai/handler.py` — `from ..ai.system_prompt import get_system_prompt`
- `ai/tutor.py` — check for system prompt imports
- `ai/help_agent.py` — check for system prompt imports
- `tests/test_system_prompt.py` — delete this test file too

Grep to find all:
```bash
grep -rn "system_prompt" --include="*.py" ai/ tests/
```

- [ ] **Step 3: Update ai/handler.py**

Remove system prompt assembly from `get_response_with_rag()` and `_dispatch_agent()`. Instead, pass `agent` name in the payload to the backend.

- [ ] **Step 4: Remove API key inputs from SettingsSidebar.jsx**

Search for any API key input fields (api_key, openrouter_api_key) and remove them from the settings UI.

- [ ] **Step 5: Run tests and commit**

```bash
python3 run_tests.py -v
git add config.py ai/handler.py frontend/src/components/SettingsSidebar.jsx
git rm ai/system_prompt.py
git commit -m "refactor: remove API keys from config, delete client-side system prompts"
```

---

## Phase 3: Verification & Cleanup

### Task 13: Security Verification & Final Cleanup

**Files:**
- All Python files (grep verification)
- `functions/src/utils/geminiClient.ts` — Can be deprecated

- [ ] **Step 1: Grep for any remaining direct API URLs**

```bash
# Must return zero results (excluding comments, docs, and this plan)
grep -r "generativelanguage.googleapis.com" --include="*.py" --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=.git .

grep -r "openrouter.ai/api" --include="*.py" \
  --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=.git .

grep -r "api.perplexity.ai" --include="*.py" \
  --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=.git .
```

- [ ] **Step 2: Verify no API keys in config defaults**

```bash
grep -n "api_key" config.py
# Should only show dev_openrouter_key and auth_token references
```

- [ ] **Step 3: Full test suite**

```bash
python3 run_tests.py -v
```

- [ ] **Step 4: Manual E2E test in Anki**

Build frontend, restart Anki, test:
1. Chat with tutor (streaming)
2. Research query
3. Insight extraction
4. Router picking correct agent
5. Embeddings working
6. Quota display correct

- [ ] **Step 5: Tag and commit**

```bash
git tag backend-consolidation-complete
git push origin backend-consolidation-complete
git commit -m "chore: backend consolidation complete — all API calls via backend"
```
