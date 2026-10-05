importScripts('utils/auth.js', 'utils/api.js');

console.log("OmniSync Background Worker initialized.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TRACK") {
    console.log("Received track request:", request);
    
    const payload = {
       raw_title: request.raw_title,
       type: request.type,
       source_url: request.source_url,
       [request.type === 'anime' ? 'episode' : 'chapter']: request.progress
    };

    syncProgress(payload)
      .then(res => {
         console.log("Sync success:", res);
         sendResponse({ success: true, data: res });
      })
      .catch(err => {
         console.error("Sync failed:", err);
         if (err.message.includes('Not authenticated')) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
         }
         sendResponse({ success: false, error: err.message });
      });
      
    return true; 
  }

  if (request.action === 'SAVE_SESSION') {
    const s = request.session;
    const toSave = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      user: s.user,
      expires_at: Math.floor(Date.now() / 1000) + (s.expires_in || 3600)
    };
    chrome.storage.local.set({ supabase_session: toSave }, () => {
      console.log('[OmniSync] AniList session saved.');
      sendResponse({ ok: true });
    });
    return true;
  }
});
