// ============================
// OmniSync Anime Tracker
// ============================

// Helper to extract cover poster image directly from the streaming page DOM
function extractDomCover(doc) {
  try {
    const og = doc.querySelector('meta[property="og:image"]')?.content ||
               doc.querySelector('meta[name="twitter:image"]')?.content;
    if (og && !/logo|favicon|default|banner|avatar/i.test(og) && og.startsWith('http')) {
      return og;
    }
    const selectors = [
      '.poster img', '.thumbnail img', '.thumb img', '.anime-cover img',
      '.series-thumb img', '.infox img', '.thumbook img', '.entry-content img',
      '.entry-header img', '.content-thumb img', '.series-img img',
      'article img', '.animeinfo img', '.imgdesc img'
    ];
    for (const s of selectors) {
      const el = doc.querySelector(s);
      const src = el?.src || el?.dataset?.src || el?.getAttribute('data-lazy-src');
      if (src && !/logo|favicon|default|banner|avatar/i.test(src) && src.startsWith('http')) {
        return src;
      }
    }
  } catch(e) {}
  return null;
}

const ANIME_PATTERNS = {
  "ylnime.com": {
    extract: (url, doc) => {
      // 1. Episode number
      let episode = null;
      const epParam = url.searchParams.get('episode');
      if (epParam) {
        const epMatch = epParam.match(/-(\d+(?:\.\d)?)$/);
        if (epMatch) episode = parseFloat(epMatch[1]);
      }
      if (!episode) {
        const docEpMatch = (doc.title + " " + (doc.querySelector('h1')?.textContent || "")).match(/Episode\s*(\d+(?:\.\d)?)/i);
        if (docEpMatch) episode = parseFloat(docEpMatch[1]);
      }

      // 2. Title from DOM (heading / breadcrumb / title) — MUCH more accurate than abbreviated URL slug!
      let title = null;
      const h1Text = doc.querySelector('h1')?.textContent?.trim();
      if (h1Text) {
        title = h1Text
          .replace(/^(nonton|streaming|download|watch)\s+/i, '')
          .replace(/\s+Episode\s*\d+.*$/i, '')
          .replace(/\s+Sub\s*Indo.*$/i, '')
          .trim();
      }
      if (!title || title.length < 3) {
        const titleMatch = (doc.title || '').match(/(?:nonton|streaming)?\s*(.+?)\s+Episode\s+\d+/i);
        if (titleMatch) {
          title = titleMatch[1].replace(/[-|–].*$/g, '').trim();
        }
      }
      // Fallback: URL series query param if DOM didn't yield a good title
      if (!title && url.searchParams.has('series')) {
        title = url.searchParams.get('series')
          .replace(/-/g, ' ')
          .replace(/\b(sub\s*indo|subtitle\s*indonesia)\b/gi, '')
          .trim();
      }

      if (!title || !episode) return null;
      return { raw_title: title, progress: episode, cover_url: extractDomCover(doc) };
    }
  },
  "animesail": {
     // URL: https://v1.animesail.xyz/one-piece-episode-1180/
     extract: (url, doc) => {
         const parts = url.pathname.split('/').filter(Boolean);
         if (parts.length === 0) return null;
         const slug = parts[parts.length - 1];
         
         const epMatch = slug.match(/(.+)-episode-(\d+(?:\.\d)?)/);
         const episode = epMatch ? parseFloat(epMatch[2]) : null;

         let title = null;
         const h1 = doc.querySelector('h1')?.textContent?.trim();
         if (h1) {
           title = h1.replace(/\s+Episode\s*\d+.*$/i, '').replace(/\s+Sub.*$/i, '').trim();
         }
         if (!title && epMatch) {
           title = epMatch[1].replace(/-/g, ' ').replace(/\b(subtitle\s*indonesia|sub\s*indo)\b/gi, '').trim();
         }
         
         if (!title || !episode) return null;
         return { raw_title: title, progress: episode, cover_url: extractDomCover(doc) };
     }
  },
  "otakudesu": {
    // URL: https://otakudesu.blog/episode/wpoiec-episode-1180-sub-indo/
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if (parts[0] !== 'episode') return null;
       
       const slug = parts[1] || parts[0]; 
       const epMatch = slug.match(/(.+)-episode-(\d+(?:\.\d)?)/);
       const episode = epMatch ? parseFloat(epMatch[2]) : null;

       // Check DOM first because slug is often an acronym like "wpoiec"
       let title = null;
       const h1 = doc.querySelector('h1.posttl, h1')?.textContent?.trim();
       if (h1) {
         title = h1.replace(/\s+Episode\s*\d+.*$/i, '').replace(/\s+Sub.*$/i, '').trim();
       }
       if (!title || title.length < 3) {
         const titleMatch = (doc.title || '').match(/^(.+?)\s+Episode\s+(\d+)/i);
         if (titleMatch) title = titleMatch[1].trim();
       }
       if (!title && epMatch) {
         title = epMatch[1].replace(/-/g, ' ').trim();
       }

       if (!title || !episode) return null;
       return { raw_title: title, progress: episode, cover_url: extractDomCover(doc) };
    }
  },
  "gogoanime": {
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if(parts.length === 0) return null;
       const slug = parts[0];
       const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
       if (!epMatch) return null;
       
       let title = doc.querySelector('.anime-info a, h1')?.textContent?.trim();
       if (!title) {
         title = epMatch[1].replace(/-/g, ' ');
       }
       return { raw_title: title, progress: parseFloat(epMatch[2]), cover_url: extractDomCover(doc) };
    }
  },
  "hstream.moe": {
    // URL: /hentai/title-slug-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      let title = doc.querySelector('h1')?.textContent?.trim();
      if (!title) title = epMatch[1].replace(/-/g, ' ');
      return { raw_title: title, progress: parseFloat(epMatch[2]), cover_url: extractDomCover(doc) };
    }
  },
  "hanime.tv": {
    // URL: /videos/hentai/title-slug-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      let title = doc.querySelector('h1')?.textContent?.trim();
      if (!title) title = epMatch[1].replace(/-/g, ' ');
      return { raw_title: title, progress: parseFloat(epMatch[2]), cover_url: extractDomCover(doc) };
    }
  }
};

function getAnimeConfig(hostname) {
  for (const [domain, config] of Object.entries(ANIME_PATTERNS)) {
    if (hostname.includes(domain)) {
      return config;
    }
  }
  return null;
}

let hasSyncedCurrentEpisode = false;

function syncAnimeProgress(data) {
  if (hasSyncedCurrentEpisode) return;
  hasSyncedCurrentEpisode = true;
  
  console.log("[OmniSync] Syncing Anime Progress:", data);
  
  chrome.runtime.sendMessage({
      action: "TRACK",
      type: "anime",
      raw_title: data.raw_title,
      progress: data.progress,
      source_url: window.location.href,
      cover_url: data.cover_url || extractDomCover(document)
  }, (response) => {
       if (chrome.runtime.lastError) {
          console.error("[OmniSync] Message Error:", chrome.runtime.lastError.message);
          hasSyncedCurrentEpisode = false; // allow retry
          return;
       }
       if(response?.success) {
          console.log("[OmniSync] Anime Progress Synced!");
       } else {
          console.error("[OmniSync] Sync Error:", response?.error);
          hasSyncedCurrentEpisode = false; // allow retry on error
       }
  });
}

function processAnimePage() {
  const url = new URL(window.location.href);
  const config = getAnimeConfig(url.hostname);
  if (!config) {
    console.log("[OmniSync] No anime config for:", url.hostname);
    return;
  }

  const data = config.extract(url, document);
  console.log("[OmniSync] Extracted anime data:", data);
  
  if (data && data.raw_title && data.progress) {
    console.log("[OmniSync] Found Anime Episode. Checking watch history...", data);
    
    // Smart Reminder: Check if rewatching or skipped episodes
    chrome.runtime.sendMessage({
      action: "CHECK_PROGRESS",
      raw_title: data.raw_title,
      progress: data.progress,
      type: "anime"
    }, () => {
      // Suppress runtime.lastError if background worker not active
      if (chrome.runtime.lastError) {}
    });

    let attempts = 0;
    const observeVideo = setInterval(() => {
        attempts++;
        const video = document.querySelector('video');
        
        if (video) {
            clearInterval(observeVideo);
            console.log("[OmniSync] Video player found! Waiting for 80% watch...");
            video.addEventListener('timeupdate', () => {
                if (video.duration > 0 && !hasSyncedCurrentEpisode) {
                    const pct = video.currentTime / video.duration;
                    if (pct >= 0.8) {
                        syncAnimeProgress(data);
                    }
                }
            });
        } else if (attempts >= 15) {
            // Cross-Origin Iframe fallback — sync after 30s dwell
            clearInterval(observeVideo);
            console.log("[OmniSync] No <video> found (iframe player). Dwell-time fallback (30s)...");
            setTimeout(() => {
                syncAnimeProgress(data);
            }, 30000); 
        }
    }, 1000);
  }
}

// ponytail: delay 3s for SPA hydration. Increase if sites are slower.
setTimeout(processAnimePage, 3000);

let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    hasSyncedCurrentEpisode = false;
    setTimeout(processAnimePage, 3000);
  }
}).observe(document, {subtree: true, childList: true});
