/**
 * Token Storage Utilities
 * 
 * Note: Firebase Auth automatically manages refresh tokens.
 * We store them in localStorage for easy access when generating deep links.
 */

const REFRESH_TOKEN_KEY = 'anki_refresh_token';
const USER_ID_KEY = 'anki_user_id';

/**
 * Saves refresh token to localStorage
 * @param userId - Firebase Auth User ID
 * @param refreshToken - Firebase Auth Refresh Token
 */
export function saveRefreshToken(userId: string, refreshToken: string): void {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_ID_KEY, userId);
  } catch (error) {
    console.error('Error saving refresh token:', error);
  }
}

/**
 * Gets refresh token from localStorage
 * @returns Refresh token or null if not found
 */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
}

/**
 * Gets user ID from localStorage
 * @returns User ID or null if not found
 */
export function getStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}

/**
 * Clears refresh token from localStorage
 */
export function clearRefreshToken(): void {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  } catch (error) {
    console.error('Error clearing refresh token:', error);
  }
}

