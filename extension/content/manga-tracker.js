// ============================
// OmniSync Manga Tracker
// ============================

// Helper to extract cover poster image directly from the reader page DOM
function extractDomCover(doc) {
  try {
    const og = doc.querySelector('meta[property="og:image"]')?.content ||
               doc.querySelector('meta[name="twitter:image"]')?.content;
    if (og && !/logo|favicon|default|banner|avatar/i.test(og) && og.startsWith('http')) {
      return og;
    }
    const selectors = [
      '.poster img', '.thumbnail img', '.thumb img', '.manga-cover img',
      '.series-thumb img', '.infox img', '.thumbook img', '.entry-content img',
      '.entry-header img', '.content-thumb img', '.series-img img',
      'article img', '.mangainfo img', '.imgdesc img'
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

const MANGA_PATTERNS = {
  "komiku.id": {
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1]; 
      if (!lastPart || !lastPart.includes('chapter')) return null;
      
      let title = doc.querySelector('h1')?.textContent?.replace(/\s+Chapter.*$/i, '').trim();
      if (!title) {
        title = lastPart.split('-chapter-')[0].replace(/-/g, ' ');
      }
      const chapter = parseInt(lastPart.split('-chapter-')[1]);
      return { raw_title: title, progress: chapter, cover_url: extractDomCover(doc) };
    }
  },
  "shinigami.asia": {
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'series' || !parts[2] || !parts[2].includes('chapter')) return null;
      
      let title = doc.querySelector('h1')?.textContent?.replace(/\s+Chapter.*$/i, '').trim();
      if (!title) {
        title = parts[1].replace(/-/g, ' ');
      }
      const chapter = parseFloat(parts[2].replace('chapter-', ''));
      return { raw_title: title, progress: chapter, cover_url: extractDomCover(doc) };
    }
  },
  "mangafire.to": {
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if (parts[0] !== 'title' && parts[0] !== 'manga') return null;
       if (!url.pathname.includes('chapter')) return null;
       
       let title = doc.querySelector('h1')?.textContent?.trim();
       if (!title) {
         title = parts[1].split('.')[0].replace(/-/g, ' ');
         title = title.replace(/^[a-z0-9]+ /i, '').trim();
       }
       
       const titleMatch = doc.title.match(/Chapter (\d+(\.\d)?)/i);
       const chapter = titleMatch ? parseFloat(titleMatch[1]) : 1;
       
       return { raw_title: title, progress: chapter, cover_url: extractDomCover(doc) };
    }
  }
};

function getMangaConfig(hostname) {
  for (const [domain, config] of Object.entries(MANGA_PATTERNS)) {
    if (hostname.includes(domain)) {
      return config;
    }
  }
  return null;
}

function processMangaPage() {
  const url = new URL(window.location.href);
  const config = getMangaConfig(url.hostname);
  if (!config) return;

  const data = config.extract(url, document);
  if (data && data.raw_title && data.progress) {
    console.log("[OmniSync] Found Manga Chapter:", data);
    
    // Smart Reminder: Check if re-reading or skipped chapters
    chrome.runtime.sendMessage({
      action: "CHECK_PROGRESS",
      raw_title: data.raw_title,
      progress: data.progress,
      type: "manga"
    }, () => {
      if (chrome.runtime.lastError) {}
    });

    // Send to background worker
    chrome.runtime.sendMessage({
      action: "TRACK",
      type: "manga",
      raw_title: data.raw_title,
      progress: data.progress,
      source_url: window.location.href,
      cover_url: data.cover_url || extractDomCover(document)
    }, (response) => {
       if(response?.success) {
          console.log("[OmniSync] Progress Synced!");
       } else {
          console.error("[OmniSync] Sync Error:", response?.error);
       }
    });
  }
}

// Run when the page is fully loaded (sometimes SPAs need navigation events though)
// We'll use a simple timeout or mutation observer, but basic load works for static domains.
setTimeout(processMangaPage, 2000); // 2 second delay to let dynamic JS titles/urls settle

// Listen to SPA navigation changes if they use pushState history
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(processMangaPage, 2000);
  }
}).observe(document, {subtree: true, childList: true});
