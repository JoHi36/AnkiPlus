/**
 * Tool / Function-Call Format Translation
 *
 * The Python client (agent_loop.py) speaks Gemini-native tool format.
 * OpenRouter speaks OpenAI tool format.
 * This module translates between the two so the backend can proxy
 * transparently.
 *
 * Gemini format reference:
 *   tools:          [{ functionDeclarations: [{ name, description, parameters }] }]
 *   functionCall:   { parts: [{ functionCall: { name, args } }] }
 *   functionResponse: { role: 'function', parts: [{ functionResponse: { name, response } }] }
 *
 * OpenAI format reference:
 *   tools:          [{ type: 'function', function: { name, description, parameters } }]
 *   tool_calls:     [{ id, type: 'function', function: { name, arguments } }]
 *   tool message:   { role: 'tool', tool_call_id, content }
 */

// ---------------------------------------------------------------------------
// Tool definitions: Gemini -> OpenAI
// ---------------------------------------------------------------------------

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface GeminiToolDefinition {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * Convert Gemini-format tool definitions to OpenAI-format.
 * Input:  [{ functionDeclarations: [{ name, description, parameters }] }]
 * Output: [{ type: 'function', function: { name, description, parameters } }]
 */
export function geminiToolsToOpenAI(
  geminiTools: GeminiToolDefinition[] | undefined
): OpenAIToolDefinition[] | undefined {
  if (!geminiTools || geminiTools.length === 0) return undefined;

  const result: OpenAIToolDefinition[] = [];

  for (const tool of geminiTools) {
    if (!tool.functionDeclarations) continue;
    for (const fn of tool.functionDeclarations) {
      result.push({
        type: 'function',
        function: {
          name: fn.name,
          ...(fn.description !== undefined && { description: fn.description }),
          ...(fn.parameters !== undefined && { parameters: fn.parameters }),
        },
      });
    }
  }

  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// History messages: Gemini -> OpenAI
// ---------------------------------------------------------------------------

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/**
 * Translate a single Gemini-format history message to OpenAI format.
 *
 * Handles three special cases:
 *  1. Model message with functionCall parts -> assistant with tool_calls
 *  2. Function role with functionResponse parts -> tool message
 *  3. Normal user/model text messages -> user/assistant
 */
export function geminiMessageToOpenAI(msg: any): OpenAIMessage | OpenAIMessage[] {
  // Case 1: Model message containing functionCall parts
  if ((msg.role === 'model' || msg.role === 'assistant') && msg.parts) {
    const toolCalls: OpenAIMessage['tool_calls'] = [];
    let textContent = '';

    for (const part of msg.parts) {
      if (part.functionCall) {
        toolCalls.push({
          // Use function name as ID since Gemini doesn't provide an ID
          id: `call_${part.functionCall.name}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      } else if (part.text) {
        textContent += part.text;
      }
    }

    if (toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCalls,
      };
    }

    // Normal assistant text message
    return {
      role: 'assistant',
      content: textContent,
    };
  }

  // Case 2: Function response (Gemini role='function')
  if (msg.role === 'function' && msg.parts) {
    const messages: OpenAIMessage[] = [];
    for (const part of msg.parts) {
      if (part.functionResponse) {
        messages.push({
          role: 'tool',
          tool_call_id: `call_${part.functionResponse.name}`,
          content: JSON.stringify(part.functionResponse.response || {}),
        });
      }
    }
    return messages.length === 1 ? messages[0] : messages;
  }

  // Case 3: Simple text history (already in { role, content } format)
  if (msg.content !== undefined) {
    const role = msg.role === 'model' ? 'assistant' : (msg.role as 'user' | 'assistant');
    return {
      role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    };
  }

  // Case 4: Gemini-format text with parts array
  if (msg.parts) {
    const text = msg.parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('');

    return {
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: text,
    };
  }

  // Fallback
  return {
    role: msg.role === 'model' ? 'assistant' : (msg.role || 'user'),
    content: typeof msg === 'string' ? msg : JSON.stringify(msg),
  };
}

/**
 * Translate a complete Gemini-format history array into OpenAI messages.
 */
export function translateHistory(history: any[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of history) {
    const translated = geminiMessageToOpenAI(msg);
    if (Array.isArray(translated)) {
      result.push(...translated);
    } else {
      result.push(translated);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Response: OpenAI -> Gemini (for tool calls in responses)
// ---------------------------------------------------------------------------

/**
 * Translate OpenAI tool_calls in an assistant response back to Gemini format.
 * Used when the model wants to call tools and we need to send the response
 * back to the Python client which expects Gemini format.
 *
 * OpenAI: { choices: [{ message: { tool_calls: [{ id, function: { name, arguments } }] } }] }
 * Gemini: { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] }
 */
export function openAIToolCallsToGemini(
  toolCalls: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>
): any {
  return {
    parts: toolCalls.map((tc) => ({
      functionCall: {
        name: tc.function.name,
        args: safeParseJSON(tc.function.arguments),
      },
    })),
  };
}

/**
 * Safely parse JSON, returning empty object on failure.
 */
function safeParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
