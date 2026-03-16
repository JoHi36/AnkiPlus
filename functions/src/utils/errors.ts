/**
 * Error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
    timestamp?: string;
  };
}

/**
 * User-friendly error messages
 */
const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  TOKEN_INVALID: 'Authentifizierung fehlgeschlagen. Bitte melden Sie sich erneut an.',
  QUOTA_EXCEEDED: 'Tageslimit erreicht. Upgrade für mehr Requests?',
  RATE_LIMIT_EXCEEDED: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
  BACKEND_ERROR: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
  GEMINI_API_ERROR: 'Der Service ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
  VALIDATION_ERROR: 'Ungültige Anfrage. Bitte überprüfen Sie Ihre Eingabe.',
};

/**
 * Error codes
 */
export enum ErrorCode {
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BACKEND_ERROR = 'BACKEND_ERROR',
  GEMINI_API_ERROR = 'GEMINI_API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Create standardized error response
 * @param code - Error code
 * @param message - Error message (will be replaced with user-friendly message if available)
 * @param details - Optional error details
 * @param requestId - Optional request ID for tracking
 * @returns Error response object
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  requestId?: string
): ErrorResponse {
  // Use user-friendly message if available, otherwise use provided message
  const userMessage = USER_FRIENDLY_MESSAGES[code] || message;

  return {
    error: {
      code,
      message: userMessage,
      ...(details && { details }),
      ...(requestId && { requestId }),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create error response from Error object
 * @param error - Error object
 * @param defaultCode - Default error code if not specified
 * @param requestId - Optional request ID for tracking
 * @returns Error response object
 */
export function createErrorResponseFromError(
  error: Error,
  defaultCode: ErrorCode = ErrorCode.BACKEND_ERROR,
  requestId?: string
): ErrorResponse {
  return createErrorResponse(
    (error as any).code || defaultCode,
    error.message || 'An unexpected error occurred',
    (error as any).details,
    requestId
  );
}


