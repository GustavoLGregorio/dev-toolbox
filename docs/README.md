# dev.gregorium.com - AI Agent Documentation Index

Welcome, Agent. This documentation is written explicitly to provide you with the context, background decisions, and architectural guidelines governing the development of `dev.gregorium.com`. When working on this repository, you must respect these decisions and design patterns.

---

## 1. Project Context & Philosophy
`dev.gregorium.com` is a brand extension of **Gregorium**. Its mission is to build **free, high-quality, transparent, and dependency-free utility tools for developers**.

### Architectural Constraints
- **Zero/Minimal Cost:** The project must run at near-zero hosting cost.
- **Zero-Product Focus:** The site does not sell products. The only monetization will be non-intrusive developer-friendly advertisements (e.g., AdsTerra or similar).
- **Absolute Transparency:** All logic must be clear, storing no user data backend-side unless explicitly required and documented.
- **Performance & Simplicity:** To respect developers and maximize loading speed, the project rejects heavy UI frameworks (React, Next.js) and styling utilities (Tailwind). It is built entirely on native HTML5, modern vanilla CSS, and vanilla ES modules.

---

## 2. Directory Structure of `docs/`

This documentation root is structured by tool/topic directories. As new developer tools are added to the portal, corresponding subdirectories should be added here to explain their context and design considerations.

```
docs/
├── README.md                 # This file (Global agent entry point)
└── index_now/                # Context & limits for the IndexNow Submitter tool
    └── API_LIMITS.md         # Active KV rate limits, proxy architecture, and abuse prevention details
```

---

## 3. Technology Stack & Key Decisions Context

### A. Vercel Hosting & Root Folder Protection
- **Decision:** We use Vercel for hosting static pages.
- **Context:** To prevent package configurations (`package.json`), documentation (`docs/`), and raw backend code (`worker/`) from being exposed publicly, we separate the directory:
  - The static site assets live inside the `dist/` folder.
  - The Vercel project has its **Root Directory** set to `dist/` in the dashboard.
  - This ensures that only `dist/` is uploaded and served by Vercel, keeping parent configuration files private.

### B. Cloudflare Workers & KV Store (Backend API)
- **Decision:** The backend proxy API is hosted on Cloudflare Workers rather than Vercel Serverless.
- **Context:** Cloudflare Workers provides a generous 100,000 requests per day on the free tier (independent of Vercel usage caps) and has no total CPU execution time limits (only 10ms CPU execution time, which is free for network fetches). A KV store named `DEV_INDEXNOW_KV` is bound to the Worker to enforce IP-based rate limits.

### C. Local Integration Testing
- The frontend `dist/indexnow/indexnow.js` includes a dynamic API resolver:
  - If running on `localhost`, it automatically routes requests to `http://localhost:8787` (local Wrangler development server).
  - In production, it routes requests to the deployed Cloudflare Worker URL.
- To test the entire platform locally:
  1. Start the Vercel static server: `bun start` (runs `vercel dev` on `http://localhost:3000`).
  2. Start the local Wrangler Worker: `cd worker && bunx wrangler dev` (runs Wrangler emulator on `http://localhost:8787` with local KV simulation).
