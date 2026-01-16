/**
 * Device ID Utilities
 * Generiert und speichert eine eindeutige Device-ID für anonyme User
 */

export function getOrCreateDeviceId() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:7',message:'getOrCreateDeviceId called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  try {
    let deviceId = localStorage.getItem('anki_chatbot_device_id');
    
    if (!deviceId) {
      // Generiere neue Device-ID
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('anki_chatbot_device_id', deviceId);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:17',message:'New Device-ID created',data:{deviceId:deviceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:23',message:'Existing Device-ID found',data:{deviceId:deviceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    }
    
    return deviceId;
  } catch (error) {
    console.error('Error getting/creating Device-ID:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:30',message:'Error getting/creating Device-ID',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return null;
  }
}

export function incrementQuotaUsage() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:39',message:'incrementQuotaUsage called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  try {
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    
    const today = new Date().toISOString().split('T')[0];
    const key = `quota_${deviceId}_${today}`;
    const currentUsage = parseInt(localStorage.getItem(key) || '0', 10);
    const newUsage = currentUsage + 1;
    
    localStorage.setItem(key, newUsage.toString());
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:53',message:'Quota usage incremented',data:{deviceId:deviceId,key:key,oldUsage:currentUsage,newUsage:newUsage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    console.error('Error incrementing quota usage:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'deviceId.js:60',message:'Error incrementing quota usage',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  }
}
