# dev.gregorium.com

Gregorium developer utilities portal. A lightweight, high-performance, transparent developer hub hosting free online utility tools.

Currently launching with the **IndexNow Submitter** tool under `/indexnow`.

---

## Technical Stack
- **Frontend Hosting:** Vercel (serves the `dist/` directory as root).
- **Backend APIs:** Cloudflare Workers (source code inside the `worker/` directory).
- **Package & Runtime Manager:** Bun
- **Key-Value Store:** Cloudflare KV (`DEV_INDEXNOW_KV` namespace used for IP-based rate limiting).

---

## Project Structure
- `/dist`: Public static assets (HTML, CSS, JS and pages) served directly by Vercel. Contains its own simplified `vercel.json` config.
- `/worker`: Cloudflare Worker source code, package config, and `wrangler.jsonc` file.
- `/docs`: Markdown documentation (optimized for AI Agents).

---

## Local Development

To test the entire platform end-to-end, you can run the Vercel static dev server and the local Cloudflare Wrangler dev server concurrently.

### 1. Install Dependencies
Ensure you have [Bun](https://bun.sh) installed. Run at the root of the project:
```bash
bun install
```
Also install the worker dependencies:
```bash
cd worker && bun install && cd ..
```

### 2. Run the Servers

#### Step A: Start Vercel Dev (Frontend)
From the root of the project, run:
```bash
bun start
```
This starts the static server at `http://localhost:3000`.

#### Step B: Start Wrangler Dev (Backend Worker)
In a separate terminal tab, run:
```bash
cd worker
bunx wrangler dev
```
This runs the Cloudflare Worker emulator at `http://localhost:8787` with local KV simulation enabled.

*Note: The frontend script in `dist/indexnow/indexnow.js` automatically detects when it is running on `localhost` and routes API requests to the Wrangler local server on port 8787.*

---

## Deployment

### Frontend (Vercel)
To deploy the static assets manually (or you can use GitHub Vercel integration, which deploys automatically on push):
```bash
bun run deploy
```

### Backend (Cloudflare Worker)
To deploy the Worker to your Cloudflare account:
```bash
cd worker
bunx wrangler deploy
```

---

## AI Agent Integration
If you are an AI Coding Agent working on this project, please consult the instructions and contextual information inside **[docs/README.md](file:///home/gustavo/Projects/dev_indexnow/docs/README.md)** first.
