/**
 * Deep Link Utilities
 * Generates deep links for Anki plugin authentication
 */

/**
 * Generates a deep link URL for Anki plugin authentication
 * @param idToken - Firebase ID Token
 * @param refreshToken - Firebase Refresh Token (optional, can be empty)
 * @returns Deep link URL: anki://auth?token=...
 */
export function generateDeepLink(
  idToken: string,
  refreshToken?: string
): string {
  const params = new URLSearchParams({
    token: idToken,
  });
  
  // Only add refreshToken if it's not empty
  if (refreshToken && refreshToken.trim() !== '') {
    params.append('refreshToken', refreshToken);
  }
  
  return `anki://auth?${params.toString()}`;
}

/**
 * Attempts to open a deep link using multiple methods
 * @param url - Deep link URL
 * @returns true if attempted, false if not supported
 */
export function openDeepLink(url: string): boolean {
  try {
    // Method 1: Try using a hidden anchor tag (works better in Safari)
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    
    // Try to click it
    anchor.click();
    
    // Clean up after a short delay
    setTimeout(() => {
      document.body.removeChild(anchor);
    }, 100);
    
    // Method 2: Fallback to window.location (for other browsers)
    // Note: Safari may show an error, but we'll try anyway
    setTimeout(() => {
      try {
        window.location.href = url;
      } catch (e) {
        // Safari will fail here, but that's expected
        console.log('Deep link opening may not be supported in this browser');
      }
    }, 50);
    
    return true;
  } catch (error) {
    console.error('Error opening deep link:', error);
    // Last resort: try window.location directly
    try {
      window.location.href = url;
      return true;
    } catch (e) {
      console.error('All deep link methods failed:', e);
      return false;
    }
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

