# ChatGPT Share Exporter: Architecture & Specifications

This document outlines the design decisions, payload parsing logic, and export specifications for the ChatGPT Share Exporter tool.

---

## 1. Context & Problem Statement

OpenAI allows users to publicly share conversations via links (`https://chatgpt.com/share/<shareId>`), but provides no built-in mechanism to quickly download or convert these shared chats into usable local formats (.md, .jsonl, .txt).

Developers frequently use ChatGPT for architectural brainstorms, research, and prompt engineering, and require fast, local exports for:
- Archiving brainstorms directly into Markdown vaults (Obsidian, Logseq, Notion).
- Fine-tuning and agent context injection (.jsonl).
- Fast inspection via command line (.txt).

---

## 2. Extraction Pipeline & Zero-Browser Architecture

Unlike traditional scrapers that rely on resource-heavy headless browsers (Chromium/Playwright/Puppeteer), this tool uses direct HTTP requests:

1. **Extraction Source:** ChatGPT exposes public share data directly at `https://chatgpt.com/backend-api/share/<shareId>`.
2. **Stateless Serverless Proxy:** Browsers cannot directly query OpenAI due to CORS policies. The proxy is deployed as a serverless API route on Vercel in [../../dist/api/chatgpt.js](../../dist/api/chatgpt.js) (and mirrored in Cloudflare Worker [../../worker/src/index.js](../../worker/src/index.js)), resolving requests on the same origin without CORS barriers.
3. **SSRF Prevention:** The proxy strictly validates the `shareId` parameter against a UUID v4 hexadecimal regex (`^[a-f0-9-]{36}$`) to block arbitrary URL requests.
4. **Client-Side Rendering:** File generation (.md, .jsonl, .txt) and downloads occur entirely inside the user's browser using native `Blob` and `URL.createObjectURL()`.

---

## 3. Supported Export Formats

### A. Markdown (`.md`)
- Header metadata: title, source URL, export timestamp, turn count.
- Structured sections for each conversational turn:
  - `## User`
  - `## Assistant (model_name)`
- Preserves code blocks (with syntax highlighting languages), tables, lists, and formatting verbatim.

### B. JSON Lines (`.jsonl`)
- One JSON object per line following standard conversational training/dataset conventions:
  ```json
  {"index": 1, "role": "user", "content": "..."}
  {"index": 2, "role": "assistant", "model": "gpt-5-5", "content": "..."}
  ```
- Compatible with LLM fine-tuning pipelines, evaluation harnesses, and vector database ingestion scripts.

### C. Plain Text (`.txt`)
- Clear turn dividers (`[USER]`, `[ASSISTANT]`) with visual separators (`===`).
- Raw text transcripts formatted for quick terminal usage (`cat`, `grep`, `head`).

---

## 4. Rate Limiting & Abuse Prevention

The Cloudflare Worker proxy enforces per-IP limits using the `DEV_INDEXNOW_KV` namespace:
- **Key Format:** `rate_chatgpt_<client_ip>`
- **Quota:** Maximum 500 share fetches per IP per day (24-hour rolling window).
- **Cooldown:** 2-second debounce between consecutive requests.
- **Excess Action:** Returns HTTP 429 Too Many Requests.

---

## 5. Relative References

- Global architecture index: [../README.md](../README.md)
- Tool frontend files: [../../dist/chatgpt-exporter/](../../dist/chatgpt-exporter/)
- Vercel API route: [../../dist/api/chatgpt.js](../../dist/api/chatgpt.js)
- Backend worker implementation: [../../worker/src/index.js](../../worker/src/index.js)
