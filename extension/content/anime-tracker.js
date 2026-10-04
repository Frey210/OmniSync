// ============================
// OmniSync Anime Tracker
// ============================

const ANIME_PATTERNS = {
  "ylnime.com": {
    extract: (url, doc) => {
      // URL: https://ylnime.com/?series=1piece-sub-indo&episode=al-150441-1180
      if (url.searchParams.has('series') && url.searchParams.has('episode')) {
        // Title from series param
        let title = url.searchParams.get('series').replace(/-/g, ' ');
        title = title.replace(/ sub ind(o)?/gi, '').trim();
        
        // Episode from last number after last dash: "al-150441-1180" -> 1180
        const epParam = url.searchParams.get('episode');
        const epMatch = epParam.match(/-(\d+(?:\.\d)?)$/);
        const episode = epMatch ? parseFloat(epMatch[1]) : null;
        
        if (!episode) return null;
        return { raw_title: title, progress: episode };
      }
      // Fallback: try document title
      // Title format: "Judul Episode XX Subtitle Indonesia | Ylnime"
      const titleMatch = doc.title.match(/^(.+?)\s+Episode\s+(\d+)/i);
      if (titleMatch) {
        return { raw_title: titleMatch[1].trim(), progress: parseFloat(titleMatch[2]) };
      }
      return null;
    }
  },
  "animesail": {
     // URL: https://v1.animesail.xyz/one-piece-episode-1180/
     extract: (url, doc) => {
         const parts = url.pathname.split('/').filter(Boolean);
         if (parts.length === 0) return null;
         const slug = parts[parts.length - 1];
         
         // Try slug first: "one-piece-episode-1180"
         const epMatch = slug.match(/(.+)-episode-(\d+(?:\.\d)?)/);
         if (epMatch) {
           const title = epMatch[1].replace(/-/g, ' ');
           return { raw_title: title, progress: parseFloat(epMatch[2]) };
         }
         
         // Fallback: document title 
         const titleMatch = doc.title.match(/(.+?)\s+Episode\s+(\d+)/i);
         if (titleMatch) {
           return { raw_title: titleMatch[1].replace(/[-–]/g, ' ').trim(), progress: parseFloat(titleMatch[2]) };
         }
         return null;
     }
  },
  "otakudesu": {
    // URL: https://otakudesu.blog/episode/wpoiec-episode-1180-sub-indo/
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if (parts[0] !== 'episode') return null;
       
       const slug = parts[1] || parts[0]; 
       // slug: "wpoiec-episode-1180-sub-indo"
       // Match: everything before "-episode-", then the number, ignore trailing "-sub-indo" etc
       const epMatch = slug.match(/(.+)-episode-(\d+(?:\.\d)?)/);
       if (epMatch) {
         let title = epMatch[1].replace(/-/g, ' ');
         return { raw_title: title.trim(), progress: parseFloat(epMatch[2]) };
       }
       
       // Fallback: document title "One Piece Episode 1180 Subtitle Indonesia | Otaku Desu"
       const titleMatch = doc.title.match(/^(.+?)\s+Episode\s+(\d+)/i);
       if (titleMatch) {
         return { raw_title: titleMatch[1].trim(), progress: parseFloat(titleMatch[2]) };
       }
       return null;
    }
  },
  "gogoanime": {
    extract: (url) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if(parts.length === 0) return null;
       const slug = parts[0];
       const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
       if (!epMatch) return null;
       
       const title = epMatch[1].replace(/-/g, ' ');
       return { raw_title: title, progress: parseFloat(epMatch[2]) };
    }
  },
  "hstream.moe": {
    // URL: /hentai/title-slug-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      return { raw_title: epMatch[1].replace(/-/g, ' '), progress: parseFloat(epMatch[2]) };
    }
  },
  "hanime.tv": {
    // URL: /videos/hentai/title-slug-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      return { raw_title: epMatch[1].replace(/-/g, ' '), progress: parseFloat(epMatch[2]) };
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
      source_url: window.location.href
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
    console.log("[OmniSync] Found Anime Episode. Looking for video player...", data);
    
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
