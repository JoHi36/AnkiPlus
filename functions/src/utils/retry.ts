/**
 * Retry utility with exponential backoff
 * Used for handling transient errors (429, 500, 502, 503)
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number; // in milliseconds
  maxDelay?: number; // in milliseconds
  multiplier?: number; // backoff multiplier
  retryableStatusCodes?: number[]; // HTTP status codes that should be retried
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
  multiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503], // Rate limit and server errors
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable based on status code
 */
function isRetryableError(error: any, retryableStatusCodes: number[]): boolean {
  if (!error || !error.response) {
    // Network errors are retryable
    return true;
  }

  const statusCode = error.response.status;
  return retryableStatusCodes.includes(statusCode);
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry (should return a Promise)
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error, opts.retryableStatusCodes)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const currentDelay = Math.min(delay, opts.maxDelay);
      
      // Log retry attempt (optional, can be removed in production)
      if (error.response) {
        console.log(
          `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${currentDelay}ms. Status: ${error.response.status}`
        );
      } else {
        console.log(
          `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${currentDelay}ms. Error: ${error.message}`
        );
      }

      // Wait before retrying
      await sleep(currentDelay);

      // Increase delay for next retry
      delay *= opts.multiplier;
    }
  }

  // All retries failed, throw last error
  throw lastError;
}

/**
 * Retry with exponential backoff for specific HTTP status codes
 * Convenience function for HTTP requests
 */
export async function retryHttpRequest<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...options,
    retryableStatusCodes: options.retryableStatusCodes || [429, 500, 502, 503],
  });
}


