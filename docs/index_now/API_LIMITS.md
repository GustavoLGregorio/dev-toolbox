# IndexNow Submitter: API Limits & Abuse Prevention

Welcome, Agent. This document details the architectural decisions and future considerations regarding rate limiting and abuse prevention for the IndexNow Submitter tool proxy endpoint (`/api/indexnow`).

---

## 1. Context of the Challenge
Because of web browser CORS (Cross-Origin Resource Sharing) restrictions, clients cannot directly fetch a user's `sitemap.xml` file or send POST requests directly to `api.indexnow.org` without experiencing CORS blocks. To enable these features seamlessly, the IndexNow Submitter utility utilizes a serverless backend proxy (`/api/indexnow`) hosted on Vercel.

### The Abuse Vector
As a public, unauthenticated endpoint, `/api/indexnow` is vulnerable to:
1. **IndexNow API Flooding:** Malicious actors could spam the proxy endpoint to exhaust `dev.gregorium.com`'s standing or IP reputation with the IndexNow protocol servers (Bing/Yandex).
2. **Third-Party Server Scraping (DoS-by-proxy):** The sitemap fetcher feature fetches target XML files. Attackers could feed the proxy thousands of distinct URLs belonging to external targets, effectively using our serverless functions to perform a distributed denial-of-service (DDoS) attack or scan external hosts.
3. **Vercel Usage Bills:** Even though Vercel's free tier is generous (100k invocations/day), a coordinated spam bot could easily exhaust this quota, causing downtime.

---

## 2. Decision: Current Stateless Implementation
To maintain absolute simplicity, rapid speed, and zero external backend infrastructure (keeping database/storage costs at exactly zero), the initial implementation is **stateless**. It does not persist query counts or IP histories on the backend.

### Mitigation Strategies in Place (Phase 1)
- **Timeouts:** The serverless function strictly limits connection and read timeouts on sitemap/verification fetches (e.g., 5 seconds max) to avoid hanging serverless threads.
- **Size Limits:** Sitemaps and verification key files are limited in download size (e.g., maximum 2MB for sitemaps, 1KB for key text files) to prevent memory exhaustion.
- **Client-Side Throttling:** The UI imposes button disable states and basic debounce limits, preventing accidental double-submits.

---

## 3. Future Roadmap: State-based Rate Limiting (Phase 2)
When traffic grows or abuse is detected, the next agent must implement stateful limits. Below are the recommended pathways:

### A. Vercel KV / Upstash Redis (Recommended)
- **Implementation:** Bind a Vercel KV (Redis) database instance.
- **Logic:** Implement a **Token Bucket** or **Sliding Window Log** algorithm keyed by the requester's IP address (extracted from `x-forwarded-for` or Vercel's `x-real-ip` headers).
- **Limits:**
  - Max 5 sitemap fetches per IP per minute.
  - Max 10 IndexNow submissions per IP per hour.
  - Daily cumulative limit of 100 URL submissions per user domain.

### B. Cloudflare Turnstile / reCAPTCHA Integration
- **Implementation:** Require a CAPTCHA verification token inside the payload of the POST request.
- **Logic:** Before the serverless function processes a sitemap fetch or IndexNow submission, it sends the Turnstile token to `https://challenges.cloudflare.com/turnstile/v0/siteverify` for validation.
- **Pros:** Completely stops automated script bots from using the proxy while remaining zero-cost (Turnstile is free).

### C. Domain Verification Locking
- **Implementation:** Only allow sitemap fetches and submissions for domains where the verification key file is already active and validated.
- **Logic:** Forces the attacker to prove ownership of the target domain before they can use our proxy to fetch its sitemap. This eliminates the "DoS-by-proxy" vector against random web servers.
