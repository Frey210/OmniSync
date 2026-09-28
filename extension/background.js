importScripts('utils/auth.js', 'utils/api.js');

console.log("OmniSync Background Worker initialized.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TRACK") {
    console.log("Received track request:", request);
    
    // Convert to sync payload
    const payload = {
       raw_title: request.raw_title,
       type: request.type,
       source_url: request.source_url,
       // Dynamic key based on type 
       [request.type === 'anime' ? 'episode' : 'chapter']: request.progress
    };

    // Execute sync asynchronously, return true to indicate async response
    syncProgress(payload)
      .then(res => {
         console.log("Sync success:", res);
         sendResponse({ success: true, data: res });
      })
      .catch(err => {
         console.error("Sync failed:", err);
         // If unauthorized, maybe prompt user or show badge
         if (err.message.includes('Not authenticated')) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
         }
         sendResponse({ success: false, error: err.message });
      });
      
    // Return true to keep message channel open for async response
    return true; 
  }
});
