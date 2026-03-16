/**
 * Device ID Management
 * Generates and stores a unique device ID in localStorage
 */

const DEVICE_ID_KEY = 'anki_chatbot_device_id';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create device ID
 * If device ID doesn't exist in localStorage, generates a new one and stores it
 * @returns Device ID string
 */
export function getOrCreateDeviceId(): string {
  try {
    // Try to get existing device ID from localStorage
    const existingId = localStorage.getItem(DEVICE_ID_KEY);
    
    if (existingId && existingId.trim() !== '') {
      return existingId.trim();
    }

    // Generate new device ID
    const newDeviceId = generateUUID();
    
    // Store in localStorage
    localStorage.setItem(DEVICE_ID_KEY, newDeviceId);
    
    console.log('Device ID generated and stored:', newDeviceId);
    
    return newDeviceId;
  } catch (error) {
    // Fallback if localStorage is not available
    console.error('Error accessing localStorage for device ID:', error);
    
    // Generate a temporary ID (won't persist across sessions)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.warn('Using temporary device ID:', tempId);
    
    return tempId;
  }
}

/**
 * Get device ID without creating a new one
 * @returns Device ID string or null if not found
 */
export function getDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch (error) {
    console.error('Error reading device ID from localStorage:', error);
    return null;
  }
}

/**
 * Clear device ID (useful for testing or logout)
 */
export function clearDeviceId(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch (error) {
    console.error('Error clearing device ID from localStorage:', error);
  }
}

