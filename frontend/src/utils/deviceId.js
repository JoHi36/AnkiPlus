/**
 * Device ID Utilities
 * Generiert und speichert eine eindeutige Device-ID für anonyme User
 */

export function getOrCreateDeviceId() {
  try {
    let deviceId = localStorage.getItem('anki_chatbot_device_id');
    
    if (!deviceId) {
      // Generiere neue Device-ID
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('anki_chatbot_device_id', deviceId);
      
    } else {
    }
    
    return deviceId;
  } catch (error) {
    return null;
  }
}

export function incrementQuotaUsage() {
  try {
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    
    const today = new Date().toISOString().split('T')[0];
    const key = `quota_${deviceId}_${today}`;
    const currentUsage = parseInt(localStorage.getItem(key) || '0', 10);
    const newUsage = currentUsage + 1;
    
    localStorage.setItem(key, newUsage.toString());
    
  } catch (error) {
  }
}
