# dev.gregorium.com

Gregorium developer utilities portal. A lightweight, high-performance, transparent developer hub hosting free online utility tools.

Currently launching with the **IndexNow Submitter** tool under `/indexnow`.

---

## Technical Stack
- **Frontend:** Vanilla HTML5, Vanilla CSS3 (BEM naming, CSS variables), and ECMAScript Modern JS.
- **Backend:** Vercel Serverless Functions (`api/` directory).
- **Package & Runtime Manager:** Bun
- **Hosting Platform:** Vercel

---

## Project Structure
- `/dist`: Public static assets (HTML, CSS, JS and pages) served directly by Vercel.
- `/api`: Serverless API routes.
- `/docs`: Markdown documentation (optimized for AI Agents).
- `vercel.json`: Route rewriting config protecting root files and serving `/dist` assets at the root path.

---

## Local Development

### 1. Install Dependencies
Ensure you have [Bun](https://bun.sh) installed. Run:
```bash
bun install
```

### 2. Run Local Emulation
To run the Vercel local dev environment (which hosts both static files under `/dist` and serverless functions under `/api` concurrently):
```bash
bun start
```

### 3. Deploy
To deploy manually via the command line:
```bash
bun run deploy
```

---

## AI Agent Integration
If you are an AI Coding Agent working on this project, please consult the instructions and contextual information inside **[docs/README.md](file:///home/gustavo/Projects/dev_indexnow/docs/README.md)** first.
