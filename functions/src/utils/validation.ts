/**
 * Input validation and sanitization utilities
 * Protects against XSS and invalid input
 */

/**
 * Sanitize string input to prevent XSS
 * @param input - Input string
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
}

/**
 * Validate message length
 * @param message - Message to validate
 * @param maxLength - Maximum length (default: 50000)
 * @returns True if valid
 */
export function validateMessageLength(message: string, maxLength: number = 50000): boolean {
  if (typeof message !== 'string') {
    return false;
  }

  return message.length > 0 && message.length <= maxLength;
}

/**
 * Validate chat request body
 * @param body - Request body
 * @returns Validation result with error message if invalid
 */
export function validateChatRequest(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  if (!body.message || typeof body.message !== 'string') {
    return { valid: false, error: 'Message is required and must be a string' };
  }

  if (!validateMessageLength(body.message)) {
    return { valid: false, error: 'Message is too long' };
  }

  // Validate mode if provided
  if (body.mode && !['compact', 'detailed'].includes(body.mode)) {
    return { valid: false, error: 'Invalid mode. Must be "compact" or "detailed"' };
  }

  // Validate model if provided
  if (body.model && typeof body.model !== 'string') {
    return { valid: false, error: 'Model must be a string' };
  }

  // Validate history if provided
  if (body.history && !Array.isArray(body.history)) {
    return { valid: false, error: 'History must be an array' };
  }

  // Validate context if provided
  if (body.context && typeof body.context !== 'object') {
    return { valid: false, error: 'Context must be an object' };
  }

  return { valid: true };
}

/**
 * Sanitize chat request body
 * @param body - Request body
 * @returns Sanitized body
 */
export function sanitizeChatRequest(body: any): any {
  const sanitized: any = {
    message: body.message ? sanitizeString(body.message) : '',
    mode: body.mode || 'compact',
    model: body.model || 'gemini-3-flash-preview',
  };

  if (body.history && Array.isArray(body.history)) {
    sanitized.history = body.history.map((msg: any) => ({
      role: msg.role || 'user',
      content: sanitizeString(msg.content || ''),
    }));
  }

  if (body.context && typeof body.context === 'object') {
    sanitized.context = {
      question: body.context.question ? sanitizeString(body.context.question) : undefined,
      answer: body.context.answer ? sanitizeString(body.context.answer) : undefined,
      frontField: body.context.frontField ? sanitizeString(body.context.frontField) : undefined,
      isQuestion: body.context.isQuestion !== undefined ? Boolean(body.context.isQuestion) : undefined,
      stats: body.context.stats || undefined,
    };
  }

  return sanitized;
}


