<p align="center">
  <img src="extension/Asset/logo_with_text.jpg" alt="OmniSync Logo" width="280" />
</p>

<h1 align="center">OmniSync</h1>

<p align="center">
  <strong>Your anime & manga progress — synced everywhere, automatically.</strong><br/>
  Cross-browser extension (Chrome & Firefox) with serverless cloud backend, dual AniList & MAL sync, and live AniChart release countdowns.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Manifest_V3-6366f1?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Firefox-Manifest_V2-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" />
  <img src="https://img.shields.io/badge/Backend-Vercel-black?style=for-the-badge&logo=vercel&logoColor=white" />
  <img src="https://img.shields.io/badge/Database-Supabase-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/AniList-OAuth2-02A9FF?style=for-the-badge&logo=anilist&logoColor=white" />
  <img src="https://img.shields.io/badge/MyAnimeList-OAuth2_PKCE-2E51A2?style=for-the-badge&logo=myanimelist&logoColor=white" />
  <img src="https://img.shields.io/badge/AniChart-Live_Countdown-02A9FF?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
</p>

<p align="center">
  <img src="extension/Asset/app_preview.jpg" alt="OmniSync App Preview" width="600" />
</p>

---

## ✨ What is OmniSync?

OmniSync is a **browser extension** that silently watches which anime episode or manga chapter you're reading/watching — and automatically saves your progress to the cloud. No more manually updating your lists. No more forgetting where you left off.

With **AniList** and **MyAnimeList (MAL)** OAuth integrations, your progress is pushed directly to both tracking platforms in real time. For ongoing anime series, OmniSync integrates with **AniChart** to display live next episode release countdowns directly on your dashboard.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🤖 **Auto-Tracking** | Detects episode/chapter from supported streaming and reader sites via URL & DOM parsing |
| 📺 **80% Watch Rule** | Anime progress only saves after you've watched past 80% duration — no accidental saves (includes 30s iframe fallback) |
| ☁️ **Cloud Sync** | Progress tied to your Supabase account; instantly synchronized across all your devices |
| 🔗 **AniList & MAL Dual Sync** | Connect AniList and MyAnimeList simultaneously to push anime (`watching`) & manga (`reading`) updates concurrently |
| ⏱️ **AniChart Countdown** | Real-time release countdown badges (`Ep X in Yd Zh`) for ongoing anime with animated pulse indicators and live per-minute updates |
| 🔔 **Smart Reminders** | Desktop notifications for sync confirmation, rewatch detection, and skipped episode alerts |
| 🦊 **Cross-Browser** | Supports Chrome (Manifest V3) and Firefox (Manifest V2 + webextension-polyfill) |
| 🔍 **Search & Filter** | Real-time title search and category filters (All / Anime / Manga) |
| 🖥️ **Glassmorphism UI** | Sleek dark dashboard with live library counters, resume links, and service status indicators |
| 🌐 **Multi-Site Support** | Covers 10+ popular anime & manga streaming/reading sites |

---

## 🌐 Supported Sites

### Anime
| Site | Domain |
|---|---|
| Ylnime | `ylnime.com` |
| AnimeSail | `animesail.xyz` |
| OtakuDesu | `otakudesu.blog` |
| GogoAnime | `gogoanime.com` / `anitaku.to` |
| HStream *(18+)* | `hstream.moe` |
| HAnime *(18+)* | `hanime.tv` |

### Manga
| Site | Domain |
|---|---|
| Komiku | `komiku.id` |
| Shinigami | `11.shinigami.asia` |
| MangaFire | `mangafire.to` |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Extension                            │
│           (Chrome MV3 / Firefox MV2 + Polyfill)                 │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │ Content      │      │ Background   │      │ Popup        │   │
│  │ Scripts      │ ───> │ Worker       │ ───> │ Dashboard    │   │
│  │ (80% watch   │      │ (event bus   │      │ (AniChart    │   │
│  │  & DOM scan) │      │  + notifs)   │      │  countdown)  │   │
│  └──────────────┘      └──────┬───────┘      └──────────────┘   │
└───────────────────────────────┼─────────────────────────────────┘
                                │ HTTPS (JWT)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel Serverless API                        │
│                     (api.farlabs.my.id)                         │
│                                                                 │
│  /api/sync          → Normalizes title via AniList / Jikan,     │
│                       upserts DB, and pushes to AniList & MAL   │
│  /api/progress      → Fetches library + live AniChart countdown │
│  /api/check         → Smart alerts (skip / rewatch detection)   │
│  /api/anilist-*     → OAuth 2.0 flow & AniList session bridge   │
│  /api/mal-*         → OAuth 2.0 PKCE flow & token management    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
        ┌───────┴────────┐             ┌────────┴────────┐
        ▼                ▼             ▼                 ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌─────────────┐
│ Supabase DB  │ │ Supabase Auth│ │AniList GraphQL│ │ MAL API v2  │
│(user_progress│ │ (PostgreSQL  │ │ (Metadata +   │ │ (Push anime │
│ media_meta   │ │  RLS)        │ │  schedule +   │ │  & manga    │
│ user_profiles│ │              │ │  progress)    │ │  progress)  │
└──────────────┘ └──────────────┘ └───────────────┘ └─────────────┘
```

---

## 🔐 Authentication & Integrations

OmniSync provides flexible login and third-party sync:

1. **Continue with AniList *(Recommended)*:**
   Click **"Continue with AniList"** in the popup → authorize on AniList. Your account is created automatically and linked to AniList.
2. **Email / Password:**
   Sign up or sign in with your email and password.
3. **Connect MyAnimeList:**
   Click the **MAL** icon on the top header to connect your MyAnimeList account via OAuth 2.0 PKCE.
4. **Dual Sync:**
   Once linked, watching anime or reading manga updates both your AniList and MyAnimeList accounts simultaneously!

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **Extension** | JavaScript (ES2020), HTML5, CSS3 — Chrome MV3 & Firefox MV2 |
| **Polyfill** | WebExtension browser-polyfill for cross-browser API normalization |
| **Backend** | Node.js Serverless Functions on Vercel |
| **Database** | Supabase (PostgreSQL with Row Level Security) |
| **Auth** | Supabase Auth + AniList OAuth 2.0 + MyAnimeList OAuth PKCE |
| **Metadata & Airing** | AniList GraphQL API + AniChart Airing Schedules + Jikan API fallback |
| **Deployment** | Vercel (auto-deploy on push) |

---

## 🛠️ Installation & Development

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account
- An [AniList Developer Client](https://anilist.co/settings/developer)
- A [MyAnimeList API Client](https://myanimelist.net/apiconfig) *(Optional, for MAL sync)*

### 1. Clone & Install
```bash
git clone https://github.com/Frey210/OmniSync.git
cd OmniSync
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# AniList OAuth
ANILIST_CLIENT_ID=your_anilist_client_id
ANILIST_CLIENT_SECRET=your_anilist_client_secret
ANILIST_REDIRECT_URI=https://your-api-domain.com/api/anilist-callback

# MyAnimeList OAuth
MAL_CLIENT_ID=your_mal_client_id
MAL_CLIENT_SECRET=your_mal_client_secret
MAL_REDIRECT_URI=https://your-api-domain.com/api/mal-callback
```

### 3. Set Up Supabase Database
Run all migration scripts in [supabase/migrations/](supabase/migrations/) in your Supabase **SQL Editor**:
- `001_initial_schema.sql` — Base tables (`media_metadata`, `user_progress`) and RLS policies
- `002_add_mal_columns.sql` — MAL columns on `user_profiles`
- `003_add_mal_id_to_media.sql` — MAL cross-reference ID on `media_metadata`
- `004_add_airing_schedule.sql` — AniChart schedule columns (`status`, `next_airing_episode`, `next_airing_at`)

### 4. Deploy Backend to Vercel
```bash
npx vercel --prod
```
Set the same environment variables in your Vercel project dashboard.

### 5. Load the Extension

#### Chrome / Brave / Edge:
```bash
npm run build:chrome
```
1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

#### Firefox:
```bash
npm run build:firefox
```
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `extension/manifest.json`

---

## 📁 Project Structure

```
OmniSync/
├── api/                        # Vercel Serverless Functions
│   ├── sync.js                 # Core sync endpoint (AniList & MAL dual push)
│   ├── progress.js             # User library fetch + live AniChart countdown
│   ├── check.js                # Smart reminder (rewatch / skip check)
│   ├── search.js               # Search media library
│   ├── delete.js               # Delete a progress entry
│   ├── anilist-auth.js         # AniList OAuth redirect
│   ├── anilist-callback.js     # AniList token exchange + session
│   ├── anilist-status.js       # Check linked AniList account
│   ├── mal-auth.js             # MAL OAuth PKCE redirect
│   ├── mal-callback.js         # MAL token exchange + profile save
│   └── mal-status.js           # Check linked MAL account
│
├── extension/
│   ├── manifest.json           # Chrome MV3 manifest
│   ├── manifest.firefox.json   # Firefox MV2 manifest
│   ├── background.js           # Service worker (sync + notifications)
│   ├── popup/
│   │   ├── popup.html          # Extension dashboard UI
│   │   ├── popup.js            # Popup logic + AniChart live timers
│   │   └── popup.css           # Glassmorphism styling + pulse badges
│   ├── content/
│   │   ├── anime-tracker.js    # Anime 80% watch tracker
│   │   ├── manga-tracker.js    # Manga chapter tracker
│   │   └── auth-callback.js    # OAuth session bridge
│   └── utils/
│       ├── api.js              # Extension API client
│       ├── auth.js             # Supabase session management
│       ├── browser-polyfill.js # WebExtension polyfill
│       └── patterns.js         # Site-specific URL & DOM extractors
│
├── supabase/migrations/        # SQL migration files
├── extension/Asset/            # Brand assets & screenshots
├── .env.example                # Environment variable template
├── vercel.json                 # Vercel routing & CORS config
└── PRD.md                      # Product Requirements Document
```

---

## 🗺️ Roadmap

- [x] Multi-site anime tracking with 80% watch threshold
- [x] Manga chapter tracking
- [x] Cloud sync via Supabase
- [x] AniList OAuth login & account linking
- [x] Auto-push progress to AniList
- [x] Browser desktop notifications on sync
- [x] Statistics dashboard (anime, manga, episodes counters)
- [x] Firefox support (MV2 manifest + webextension-polyfill)
- [x] MyAnimeList integration (OAuth PKCE + auto-refresh + dual anime & manga sync)
- [x] AniChart integration (next episode release countdown badge with pulse urgency for ongoing anime)

---

## 🤝 Contributing

Pull requests are welcome! For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © 2024 Fariz Achmad Faizal
