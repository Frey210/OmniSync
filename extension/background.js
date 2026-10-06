importScripts('utils/auth.js', 'utils/api.js');

console.log("OmniSync Background Worker initialized.");

// Monitor AniList callback tab — read session from page localStorage
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.includes('api.farlabs.my.id/api/anilist-callback')
  ) {
    // Give the page script 500ms to run and set localStorage
    setTimeout(() => {
      chrome.tabs.get(tabId, (existingTab) => {
        if (chrome.runtime.lastError || !existingTab) return; // Tab already closed

        chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const raw = localStorage.getItem('omnisync_pending_session');
            if (raw) localStorage.removeItem('omnisync_pending_session');
            return raw;
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            // Benign error if closed in the interim
            return;
          }
          const raw = results?.[0]?.result;
          if (!raw) return;

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
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: '🎉 OmniSync — Logged In',
                message: `Welcome! Your AniList account is now connected.`,
                silent: false
              });
              chrome.tabs.remove(tabId).catch(() => {});
            });
          } catch (e) {
            console.error('[OmniSync] Failed to parse session:', e);
          }
        });
      });
    }, 500);
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
         // Show browser notification on success
         const d = res?.data;
         const title = d?.canonical_title || payload.raw_title;
         const progress = payload.type === 'anime'
           ? `Episode ${payload.episode}`
           : `Chapter ${payload.chapter}`;
         chrome.notifications.create({
           type: 'basic',
           iconUrl: 'icons/icon48.png',
           title: '✅ OmniSync Synced',
           message: `${title} — ${progress} saved.`,
           silent: true
         });
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
