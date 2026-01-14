/**
 * Error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

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
 * @param message - Error message
 * @param details - Optional error details
 * @returns Error response object
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * Create error response from Error object
 * @param error - Error object
 * @param defaultCode - Default error code if not specified
 * @returns Error response object
 */
export function createErrorResponseFromError(
  error: Error,
  defaultCode: ErrorCode = ErrorCode.BACKEND_ERROR
): ErrorResponse {
  return createErrorResponse(
    (error as any).code || defaultCode,
    error.message || 'An unexpected error occurred',
    (error as any).details
  );
}

