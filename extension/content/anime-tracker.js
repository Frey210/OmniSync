// ============================
// OmniSync Anime Tracker
// ============================

const ANIME_PATTERNS = {
  "ylnime.com": {
    extract: (url) => {
      if (url.searchParams.has('series') && url.searchParams.has('episode')) {
        let title = url.searchParams.get('series').replace(/-/g, ' ');
        // clean up descriptive words like "sub ind"
        title = title.replace(/ sub ind/g, '').replace(/ sub indo/g, '');
        
        const epParam = url.searchParams.get('episode');
        const epMatch = epParam.match(/-(\d+(\.\d)?)$/) || epParam.match(/^(\d+(\.\d)?)$/);
        const episode = epMatch ? parseFloat(epMatch[1]) : 1; 
        
        return { raw_title: title.trim(), progress: episode };
      }
      return null;
    }
  },
  "animesail.xyz": {
     extract: (url) => {
         const parts = url.pathname.split('/').filter(Boolean);
         if (parts.length === 0) return null;
         const slug = parts[parts.length - 1];
         const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
         if (!epMatch) return null;
         
         const title = epMatch[1].replace(/-/g, ' ');
         return { raw_title: title, progress: parseFloat(epMatch[2]) };
     }
  },
  "otakudesu.blog": {
    extract: (url) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if (parts[0] !== 'episode' && !parts[0].includes('episode')) return null;
       const slug = parts[0]; 
       const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
       if (!epMatch) return null;
       
       const title = epMatch[1].replace(/-/g, ' ');
       return { raw_title: title, progress: parseFloat(epMatch[2]) };
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
  
  console.log("[OmniSync] 80% Threshold Reached! Syncing Video Progress:", data);
  
  chrome.runtime.sendMessage({
      action: "TRACK",
      type: "anime",
      raw_title: data.raw_title,
      progress: data.progress,
      source_url: window.location.href
  }, (response) => {
       if(response?.success) {
          console.log("[OmniSync] Anime Progress Synced!");
       } else {
          console.error("[OmniSync] Sync Error:", response?.error);
       }
  });
}

function processAnimePage() {
  const url = new URL(window.location.href);
  const config = getAnimeConfig(url.hostname);
  if (!config) return;

  const data = config.extract(url, document);
  if (data && data.raw_title && data.progress) {
    console.log("[OmniSync] Found Anime Episode. Waiting for 80% watch time...", data);
    
    // Find video tag
    const observeVideo = setInterval(() => {
        // Grab first video tag, or wait if it's rendered dynamically/in shadow DOM (some sites use iframes though).
        // Warning: if it's an iframe (like many anime streaming sites), we can't easily read timeupdate due to cross-origin.
        // For this PRD scope, we check document.querySelector('video')
        const video = document.querySelector('video');
        if (video) {
            clearInterval(observeVideo);
            console.log("[OmniSync] Video player attached.");
            
            video.addEventListener('timeupdate', () => {
                if (video.duration > 0 && !hasSyncedCurrentEpisode) {
                    const pct = video.currentTime / video.duration;
                    if (pct >= 0.8) {
                        syncAnimeProgress(data);
                    }
                }
            });
        }
    }, 1500);
    
    // Stop trying after 30 seconds
    setTimeout(() => clearInterval(observeVideo), 30000);
  }
}

setTimeout(processAnimePage, 2000);

let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    hasSyncedCurrentEpisode = false; // Reset for next episode
    setTimeout(processAnimePage, 2000);
  }
}).observe(document, {subtree: true, childList: true});
