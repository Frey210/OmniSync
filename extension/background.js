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
         const progressText = payload.type === 'anime'
           ? `Episode ${payload.episode}`
           : `Chapter ${payload.chapter}`;

         // Notice whether this was an update or already up to date
         const isAlreadyDone = res.message === 'Progress already up to date';
         const title = payload.raw_title.charAt(0).toUpperCase() + payload.raw_title.slice(1);

         chrome.notifications.create({
           type: 'basic',
           iconUrl: 'icons/icon48.png',
           title: isAlreadyDone ? 'ℹ️ OmniSync — Sudah Tercatat' : '🎉 OmniSync — Berhasil Disinkronkan!',
           message: isAlreadyDone 
             ? `${title} (${progressText}) sudah ada di riwayat tontonanmu.` 
             : `${title} (${progressText}) berhasil disimpan ke cloud, AniList & MAL!`,
           priority: 2,
           silent: false
         });
         sendResponse({ success: true, data: res });
      })
      .catch(err => {
         console.error("Sync failed:", err);
         if (err.message && err.message.includes('Not authenticated')) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
         }
         sendResponse({ success: false, error: err.message });
      });
      
    return true; 
  }

  // --- SMART REMINDER: Check progress when opening page ---
  if (request.action === "CHECK_PROGRESS") {
    checkProgress({
      raw_title: request.raw_title,
      progress: request.progress,
      type: request.type
    })
    .then(res => {
      if (!res || !res.tracked) {
        sendResponse({ tracked: false });
        return;
      }

      const typeLabel = res.type === 'anime' ? 'Episode' : 'Chapter';
      const title = res.canonical_title || request.raw_title;

      if (res.is_jump) {
        // Melompati episode!
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `⚠️ OmniSync — ${typeLabel} Terlompati!`,
          message: `Kamu membuka ${typeLabel} ${res.current_progress}, padahal terakhir kamu tonton/baca adalah ${typeLabel} ${res.last_progress}!`,
          priority: 2,
          silent: false
        });
      } else if (res.is_rewatch) {
        // Sudah pernah ditonton / rewatch
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: `ℹ️ OmniSync — Pernah Kamu Tonton`,
          message: `Kamu membuka ${typeLabel} ${res.current_progress}. Catatan terakhirmu sudah sampai ${typeLabel} ${res.last_progress}.`,
          priority: 1,
          silent: false
        });
      }

      sendResponse({ ok: true, data: res });
    })
    .catch(err => {
      // Non-critical, ignore if unauth or network error
      console.log("[OmniSync] Check progress silent err:", err.message);
      sendResponse({ ok: false });
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
