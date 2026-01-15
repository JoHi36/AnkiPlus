/**
 * Deep Link Utilities
 * Generates deep links for Anki plugin authentication
 */

/**
 * Generates a deep link URL for Anki plugin authentication
 * @param idToken - Firebase ID Token
 * @param refreshToken - Firebase Refresh Token
 * @returns Deep link URL: anki://auth?token=...&refreshToken=...
 */
export function generateDeepLink(
  idToken: string,
  refreshToken: string
): string {
  const params = new URLSearchParams({
    token: idToken,
    refreshToken: refreshToken,
  });
  return `anki://auth?${params.toString()}`;
}

/**
 * Attempts to open a deep link
 * @param url - Deep link URL
 * @returns true if attempted, false if not supported
 */
export function openDeepLink(url: string): boolean {
  try {
    // Try to open the deep link
    window.location.href = url;
    return true;
  } catch (error) {
    console.error('Error opening deep link:', error);
    return false;
  }
}

/**
 * Copies text to clipboard
 * @param text - Text to copy
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (fallbackError) {
      console.error('Fallback copy failed:', fallbackError);
      return false;
    }
  }
}

