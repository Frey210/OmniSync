# Product Requirements Document (PRD)
**Project Name:** OmniSync - Cross-Platform Anime & Manga Tracker  
**Lead Engineer:** Fariz Achmad Faizal  
**Document Status:** Draft / Planning  
**Target Deployment:** `api.farlabs.my.id` (via Vercel Custom Domain)  

---

## 1. Executive Summary
OmniSync is a Manifest V3 browser extension paired with a cloud-native serverless backend that automatically tracks users' manga reading and anime watching progress across fragmented web platforms. By leveraging Vercel for serverless API routing and Supabase for authentication and PostgreSQL data management, the system provides a seamless, "zero-click" synchronization experience while maintaining a 100% free-tier operational cost.

## 2. Goals & Objectives
*   **User Experience:** Eliminate the need for manual tracking on platforms like MyAnimeList or AniList. The extension works silently in the background, updating progress only when specific read/watch thresholds are met.
*   **Engineering Portfolio Value:** Demonstrate enterprise-grade Cloud-Native architecture. The project showcases expertise in Serverless computing (Vercel), Backend-as-a-Service integration (Supabase), relational database design, DOM manipulation, and cross-platform authentication (Supabase Auth).

## 3. Core Features & Specifications

### A. Extension Engine (Client-Side)
*   **Pattern Matching & Extraction:** Utilizes Regular Expressions (Regex) within a Background Service Worker to extract media titles and chapter/episode numbers from the DOM and URLs of whitelisted domains.
*   **Watch-Time Verification:** For video content, a content script listens to the HTML5 `<video>` player's `timeupdate` event. Data is only designated as "consumed" and synced to the server once the user surpasses the 80% duration threshold.
*   **Cross-Site Continuity (Auto-Redirect):** Injects a dynamic prompt when a user visits the homepage of a supported site if they have unread chapters recorded from a *different* site (e.g., "Resume Chapter 46 here?").
*   **Popup Dashboard:** A lightweight UI displaying the user's latest activities, featuring one-click resumption links and an embedded Supabase Auth login flow.

### B. Serverless Backend (Vercel + Supabase)
*   **Identity Normalization:** Vercel Serverless Functions intercept incoming raw titles from the extension and query the AniList GraphQL API to resolve them into universal Media IDs.
*   **Real-time Database:** Supabase PostgreSQL stores user progress securely. Row Level Security (RLS) ensures users can only read and write their own tracking data.
*   **Multi-Device Synchronization:** Progress is tied to the user's Supabase Auth identity, instantly synchronizing across all devices where the extension is installed and logged in.

## 4. Technology Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Browser Extension** | JavaScript (Manifest V3), HTML/CSS | Adheres to modern browser security policies; lightweight execution without framework overhead. |
| **API Gateway / Compute** | Vercel (Node.js Serverless Functions) | Handles AniList GraphQL requests and data validation securely without exposing API keys on the client side. |
| **Database & Auth** | Supabase (PostgreSQL + Auth) | Provides secure user management and relational data storage within a robust free tier. |
| **External Metadata** | AniList GraphQL API | Standardizes disparate media titles into universal identifiers. |

## 5. System Architecture & Data Flow

1.  **Event Trigger:** User watches "Episode 12" on a whitelisted site. The video hits the 80% completion mark.
2.  **Client Payload:** The extension's Content Script sends a JSON payload `{ raw_title: "naruto shippuden", episode: 12, type: "anime" }` alongside the Supabase Auth JWT token to the Vercel API.
3.  **Backend Normalization:** Vercel validates the JWT, then queries AniList with the `raw_title`. AniList returns the universal ID `1735`.
4.  **Database Upsert:** Vercel executes an `UPSERT` operation to the Supabase PostgreSQL database, updating the user's record for ID `1735` to Episode 12.
5.  **Client Update:** The extension's Popup UI reflects the new progress instantly upon the next open.

## 6. High-Level Database Schema (Supabase)

*   **`users` (Managed by Supabase Auth):** Handles identity and session tokens.
*   **`media_metadata`:** Caches data from AniList to reduce external API calls.
    *   `media_id` (PK, matches AniList ID)
    *   `canonical_title`
    *   `cover_image_url`
*   **`user_progress`:**
    *   `id` (PK)
    *   `user_id` (FK -> users.id)
    *   `media_id` (FK -> media_metadata.media_id)
    *   `latest_chapter_episode` (Int)
    *   `updated_at` (Timestamp)

## 7. Implementation Roadmap

*   **Phase 1: Cloud & Database Provisioning (Week 1)**
    *   Initialize the Supabase project and configure PostgreSQL tables with RLS.
    *   Set up the GitHub repository and connect it to Vercel for automated Serverless API deployments.
*   **Phase 2: API & Normalization Logic (Week 2)**
    *   Develop Vercel endpoints to accept POST requests.
    *   Implement the AniList GraphQL integration for title matching.
    *   Verify data flow from Postman -> Vercel -> Supabase.
*   **Phase 3: Extension Core Engine (Week 3)**
    *   Develop Manifest V3 background workers and content scripts.
    *   Implement Regex URL parsing and HTML5 video time-tracking.
    *   Integrate Supabase Auth login within the extension popup.
*   **Phase 4: UI Refinement & Domain Routing (Week 4)**
    *   Finalize the Popup UI design.
    *   Map the Vercel deployment to `api.farlabs.my.id`.
    *   Conduct end-to-end testing across multiple whitelisted domains.