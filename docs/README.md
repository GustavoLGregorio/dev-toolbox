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
    └── API_LIMITS.md         # Open discussion on rate limits and abuse prevention
```

---

## 3. Technology Stack & Key Decisions Context

### A. Vercel Hosting & Root Folder Protection
- **Decision:** We use Vercel for hosting static pages and APIs.
- **Context:** To prevent package configurations (`package.json`), documentation (`docs/`), and raw backend code (`api/`) from being exposed publicly, we separate the directory:
  - The static site assets live inside the `dist/` folder.
  - Vercel's rewrite engine routes `/api/*` to serverless function endpoints and redirects all other traffic to the `dist/` subfolder.
  - This ensures that root files remain private.

### B. Pure CSS & BEM (Block-Element-Modifier)
- **Decision:** Pure CSS styling, utilizing the BEM structure, and absolute reliance on CSS custom properties (variables) for parameters.
- **Context:** Rather than loading large style sheets, we write modular and highly performant CSS. Custom styles must be reusable. Values such as colors, margins, font-sizes, and border radii must **never** be hardcoded. They are managed through CSS custom properties defined in `:root`. This facilitates simple transitions between light and dark mode (using the modern CSS `light-dark()` function or custom media preferences).

### C. Modern Vanilla JavaScript & EDP
- **Decision:** Modern ES6+ JavaScript following an Event-Driven Pattern (EDP).
- **Context:** We keep JS lightweight. Global behaviors (like navigation, theme toggling, or layout settings) reside in `dist/index.js`. Tool-specific features reside in page-specific scripts (e.g., `dist/indexnow/indexnow.js`). This separation avoids bloated script files and ensures each page loads only what is necessary.
