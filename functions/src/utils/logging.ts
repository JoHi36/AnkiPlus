import * as functions from 'firebase-functions';

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
    functions.logger.info(message, {
      requestId: this.requestId,
      userId: this.userId,
      ...data,
    });
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    functions.logger.warn(message, {
      requestId: this.requestId,
      userId: this.userId,
      ...data,
    });
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, data?: any): void {
    const errorData: any = {
      requestId: this.requestId,
      userId: this.userId,
      ...data,
    };

    if (error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code }),
      };
    }

    functions.logger.error(message, errorData);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    functions.logger.debug(message, {
      requestId: this.requestId,
      userId: this.userId,
      ...data,
    });
  }
}

/**
 * Create logger instance
 */
export function createLogger(requestId?: string, userId?: string): Logger {
  return new Logger(requestId, userId);
}


