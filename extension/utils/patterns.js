/**
 * OmniSync Domain Regex Rules
 * Define how we extract raw_title and chapter/episode digits from each whitelisted site.
 */

export const PATTERNS = {
  // ============================
  // MANGA SITES
  // ============================
  "komiku.id": {
    type: "manga",
    // Example: https://komiku.id/ch/one-piece-chapter-1000/
    urlMatch: /\/ch\/([a-zA-Z0-9-]+-chapter-(\d+))/, // Group 1 contains title-ch, Group 2 is chapter
    extract: (url, doc) => {
      // Very basic fallback extraction if regex doesn't match perfectly
      // We will parse the path to get details
      const parts = url.pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1]; // "one-piece-chapter-1000"
      if (!lastPart.includes('chapter')) return null;
      
      const title = lastPart.split('-chapter-')[0].replace(/-/g, ' ');
      const chapter = parseInt(lastPart.split('-chapter-')[1]);
      return { raw_title: title, progress: chapter };
    }
  },
  "shinigami.asia": {
    type: "manga",
    // Example: https://11.shinigami.asia/series/title-name/chapter-10
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'series' || !parts[2] || !parts[2].includes('chapter')) return null;
      
      const title = parts[1].replace(/-/g, ' ');
      // Handle "chapter-10" or "chapter-10.5"
      const chapterStr = parts[2].replace('chapter-', '');
      const chapter = parseFloat(chapterStr);
      return { raw_title: title, progress: chapter };
    }
  },
  "mangafire.to": {
    type: "manga",
    // Example: https://mangafire.to/manga/naruto.123/chapter-45
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if (parts[0] !== 'manga' || !parts[2] || !parts[2].includes('chapter')) return null;
       
       // Handle "naruto.123" -> "naruto"
       const titlePart = parts[1].split('.')[0];
       const title = titlePart.replace(/-/g, ' ');
       const chapterStr = parts[2].replace('chapter-', '');
       const chapter = parseFloat(chapterStr);
       return { raw_title: title, progress: chapter };
    }
  },

  // ============================
  // ANIME SITES
  // ============================
  "ylnime.com": {
    type: "anime",
    extract: (url, doc) => {
      // E.g., /episode/jujutsu-kaisen-episode-4/
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'episode') return null;
      const slug = parts[1]; // "jujutsu-kaisen-episode-4"
      if (!slug.includes('-episode-')) return null;

      const title = slug.split('-episode-')[0].replace(/-/g, ' ');
      const episode = parseFloat(slug.split('-episode-')[1]);
      return { raw_title: title, progress: episode };
    }
  },
  "animesail.xyz": {
     type: "anime",
     extract: (url, doc) => {
         const parts = url.pathname.split('/').filter(Boolean);
         // similar fallback
         if (parts.length === 0) return null;
         const slug = parts[parts.length - 1]; // "one-piece-episode-1000-subtitle-indonesia"
         const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
         if (!epMatch) return null;
         
         const title = epMatch[1].replace(/-/g, ' ');
         const episode = parseFloat(epMatch[2]);
         return { raw_title: title, progress: episode };
     }
  },
  "otakudesu.blog": {
    type: "anime",
    extract: (url, doc) => {
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
    type: "anime",
    // Example: /one-piece-episode-1000
    extract: (url, doc) => {
       const parts = url.pathname.split('/').filter(Boolean);
       if(parts.length === 0) return null;
       const slug = parts[0];
       const epMatch = slug.match(/(.+)-episode-(\d+(\.\d)?)/);
       if (!epMatch) return null;
       
       const title = epMatch[1].replace(/-/g, ' ');
       return { raw_title: title, progress: parseFloat(epMatch[2]) };
    }
  },

  // ============================
  // ADULT / HENTAI SITES
  // ============================
  "hstream.moe": {
    type: "anime",
    // Example: /hentai/ane-wa-yanmama-junyuu-chuu-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      // last segment is title-slug ending in -episode_number
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      const title = epMatch[1].replace(/-/g, ' ');
      return { raw_title: title, progress: parseFloat(epMatch[2]) };
    }
  },
  "hanime.tv": {
    type: "anime",
    // Example: /videos/hentai/ane-wa-yanmama-junyuu-chuu-1
    extract: (url, doc) => {
      const parts = url.pathname.split('/').filter(Boolean);
      // path: videos/hentai/<slug-N>
      const slug = parts[parts.length - 1];
      const epMatch = slug.match(/^(.+?)-(\d+)$/);
      if (!epMatch) return null;
      const title = epMatch[1].replace(/-/g, ' ');
      return { raw_title: title, progress: parseFloat(epMatch[2]) };
    }
  }
};

/**
 * Identify current URL and try extracting data
 */
export function getDomainConfig(hostname) {
  // Hostname handling like "11.shinigami.asia" to "shinigami.asia"
  for (const [domain, config] of Object.entries(PATTERNS)) {
    if (hostname.includes(domain)) {
      return config;
    }
  }
  return null;
}
