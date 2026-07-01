# IndexNow Submitter: API Limits & Abuse Prevention

Welcome, Agent. This document details the architectural decisions and active implementation of rate limiting and abuse prevention for the IndexNow Submitter tool on Cloudflare Workers.

---

## 1. Context of the Challenge
Because of web browser CORS (Cross-Origin Resource Sharing) restrictions, clients cannot directly fetch a user's `sitemap.xml` file or send POST requests directly to `api.indexnow.org` without experiencing CORS blocks. To enable these features seamlessly, the IndexNow Submitter utility utilizes a Cloudflare Worker proxy (`worker/src/index.js`).

### The Abuse Vector
As a public, unauthenticated endpoint, our Worker is vulnerable to:
1. **IndexNow API Flooding:** Malicious actors could spam the proxy endpoint to exhaust `dev.gregorium.com`'s standing or IP reputation with the IndexNow protocol servers (Bing/Yandex).
2. **Third-Party Server Scraping (DoS-by-proxy):** The sitemap fetcher feature fetches target XML files. Attackers could feed the proxy thousands of distinct URLs belonging to external targets, effectively using our serverless functions to perform a distributed denial-of-service (DDoS) attack or scan external hosts.

---

## 2. Active Implementation: KV-Based Rate Limiting

To prevent abuse without introducing high latency or paid infrastructure, we utilize the **Cloudflare KV** store (bound to the Worker as `DEV_INDEXNOW_KV`).

### Limits & Keys Structure
The rate-limiting policies are enforced on a per-request IP address basis, extracting the client IP from the `CF-Connecting-IP` header:

1. **URL Submissions (`action=submit`):**
   - **Key Format:** `rate_submit_<client_ip>`
   - **Policy:** Maximum **10 submissions per IP address per hour**.
   - **Exceeded Action:** Returns HTTP `429 Too Many Requests` with a descriptive JSON error.

2. **XML Sitemap Fetches (`action=sitemap`):**
   - **Key Format:** `rate_sitemap_<client_ip>`
   - **Policy:** Maximum **20 sitemap fetches per IP address per hour**.
   - **Exceeded Action:** Returns HTTP `429 Too Many Requests`.

### Rate Limiting Logic (`enforceRateLimit` helper)
The Worker stores rate limit states as JSON records in KV:
```json
{
  "count": 5,
  "timestamp": 1782882703032
}
```
- If a record is found and the elapsed time since `timestamp` is within 3600 seconds, the counter is checked. If it is under the limit, the count is incremented, and saved back with a TTL matching the remainder of the window.
- If the window has elapsed, the counter resets to 1, and the timestamp updates to `Date.now()`.
- If a write/read fails, the Worker **fails open** to ensure service continuity for end-users.

---

## 3. Future Roadmap: Domain Validation Locking
If sitemap scraping abuse persists, the next step is to restrict sitemap downloads only to domains that have already passed the verification key check.
- **Proposed Logic:** Before downloading a sitemap for `domain.com`, check KV to see if a key has been successfully validated for `domain.com` within the last 24 hours (e.g. `verified_domain_domain.com`). If not verified, reject the sitemap download request.
