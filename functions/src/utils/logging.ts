import * as functions from 'firebase-functions';

/**
 * Sanitize sensitive data from logs
 */
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = [
    'token',
    'authToken',
    'refreshToken',
    'apiKey',
    'api_key',
    'password',
    'secret',
    'authorization',
    'Authorization',
  ];

  const sanitized = { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive information
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Structured logging helper
 */
export class Logger {
  private requestId: string;
  private userId?: string;

  constructor(requestId?: string, userId?: string) {
    this.requestId = requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.userId = userId;
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    const logData = {
      requestId: this.requestId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...sanitizeData(data),
    };
    functions.logger.info(message, logData);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    const logData = {
      requestId: this.requestId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...sanitizeData(data),
    };
    functions.logger.warn(message, logData);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, data?: any): void {
    const errorData: any = {
      requestId: this.requestId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...sanitizeData(data),
    };

    if (error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code }),
        ...(error.response && {
          status: error.response.status,
          statusText: error.response.statusText,
        }),
      };
    }

    functions.logger.error(message, sanitizeData(errorData));
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    const logData = {
      requestId: this.requestId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...sanitizeData(data),
    };
    functions.logger.debug(message, logData);
  }
}

/**
 * Create logger instance
 */
export function createLogger(requestId?: string, userId?: string): Logger {
  return new Logger(requestId, userId);
}


