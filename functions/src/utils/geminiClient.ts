/**
 * Gemini API Client with connection pooling
 * Reuses HTTP connections for better performance
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import https from 'https';

// Create axios instance with connection pooling
const geminiClient: AxiosInstance = axios.create({
  httpsAgent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000, // 30 seconds
    maxSockets: 50, // Maximum number of sockets per host
    maxFreeSockets: 10, // Maximum number of free sockets
  }),
  timeout: 60000, // 60 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Make a POST request to Gemini API
 * @param url - API URL
 * @param data - Request data
 * @param config - Additional axios config
 * @returns Axios response
 */
export async function geminiPost(
  url: string,
  data: any,
  config?: AxiosRequestConfig
) {
  return geminiClient.post(url, data, config);
}

/**
 * Get the axios instance for advanced usage
 */
export function getGeminiClient(): AxiosInstance {
  return geminiClient;
}

