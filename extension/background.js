importScripts('utils/auth.js', 'utils/api.js');

console.log("OmniSync Background Worker initialized.");

// Monitor AniList callback tab — read session from page localStorage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.includes('api.farlabs.my.id/api/anilist-callback')
  ) {
    // Give the page script 800ms to run and set localStorage
    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const raw = localStorage.getItem('omnisync_pending_session');
          if (raw) localStorage.removeItem('omnisync_pending_session');
          return raw;
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('[OmniSync] executeScript error:', chrome.runtime.lastError.message);
          return;
        }
        const raw = results?.[0]?.result;
        if (!raw) {
          console.log('[OmniSync] No pending session found in page localStorage');
          return;
        }
        try {
          const s = JSON.parse(raw);
          const toSave = {
            access_token: s.access_token,
            refresh_token: s.refresh_token,
            user: s.user,
            expires_at: Math.floor(Date.now() / 1000) + (s.expires_in || 3600)
          };
          chrome.storage.local.set({ supabase_session: toSave }, () => {
            console.log('[OmniSync] AniList session saved from callback page!');
            // Close the callback tab
            chrome.tabs.remove(tabId).catch(() => {});
          });
        } catch (e) {
          console.error('[OmniSync] Failed to parse session:', e);
        }
      });
    }, 800);
  }
});

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
