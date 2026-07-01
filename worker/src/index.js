/**
 * Cloudflare Worker for dev.gregorium.com IndexNow tool.
 * Handles:
 *  - CORS Preflight (OPTIONS) and Response headers.
 *  - Key hosting pre-verification proxy.
 *  - Sitemap XML loader proxy (with size limits).
 *  - IndexNow URL submission proxy.
 *  - IP-based rate limiting on submit/sitemap using Cloudflare KV.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    // 1. CORS Headers Builder
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400', // 24 hours preflight cache
    };

    // Respond to CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Only allow POST requests for actual logic
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const action = url.searchParams.get('action');
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Parse request body JSON
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==========================================
    // Action: KEY VERIFICATION PROXY
    // ==========================================
    if (action === 'verify') {
      const { key, keyLocation } = body;
      if (!key || !keyLocation) {
        return new Response(JSON.stringify({ error: 'Missing key or keyLocation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(keyLocation, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: `Verification file unreachable. Status: ${response.status} ${response.statusText}`
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const bodyText = (await response.text()).trim();
        const targetKey = key.trim();

        if (bodyText === targetKey) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          const truncatedContent = bodyText.substring(0, 100);
          return new Response(JSON.stringify({
            success: false,
            error: `Key mismatch. The file at keyLocation contains "${truncatedContent}..." instead of "${targetKey}".`
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (err) {
        const errorMsg = err.name === 'AbortError' ? 'Connection timed out (5s)' : err.message;
        return new Response(JSON.stringify({
          success: false,
          error: `Could not reach verification URL: ${errorMsg}`
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ==========================================
    // Action: XML SITEMAP LOADER (CORS Proxy)
    // ==========================================
    else if (action === 'sitemap') {
      const { sitemapUrl } = body;
      if (!sitemapUrl) {
        return new Response(JSON.stringify({ error: 'Missing sitemapUrl' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // KV Rate Limiter for Sitemaps: Max 20 fetches per IP per hour
      const sitemapLimitKey = `rate_sitemap_${clientIp}`;
      const hasLimitExceeded = await enforceRateLimit(env.DEV_INDEXNOW_KV, sitemapLimitKey, 20, 3600);
      if (hasLimitExceeded) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded: Max 20 sitemap fetches per hour.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(sitemapUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return new Response(JSON.stringify({ error: `Sitemap file unreachable. Status: ${response.status}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const bodyText = await response.text();
        if (bodyText.length > 2 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: 'Sitemap size limits exceeded (Max: 2MB).' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(bodyText, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
        });
      } catch (err) {
        const errorMsg = err.name === 'AbortError' ? 'Connection timed out (8s)' : err.message;
        return new Response(JSON.stringify({ error: `Could not fetch sitemap: ${errorMsg}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ==========================================
    // Action: INDEXNOW SUBMIT PROXY
    // ==========================================
    else if (action === 'submit') {
      const { host, key, keyLocation, urlList } = body;
      if (!host || !key || !urlList || !Array.isArray(urlList)) {
        return new Response(JSON.stringify({ error: 'Missing required parameters: host, key, and urlList' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (urlList.length === 0) {
        return new Response(JSON.stringify({ error: 'urlList must contain at least one URL.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // KV Rate Limiter for Submissions: Max 10 submissions per IP per hour
      const submitLimitKey = `rate_submit_${clientIp}`;
      const hasLimitExceeded = await enforceRateLimit(env.DEV_INDEXNOW_KV, submitLimitKey, 10, 3600);
      if (hasLimitExceeded) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded: Max 10 index submissions per hour.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const payload = { host, key, urlList };
        if (keyLocation) {
          payload.keyLocation = keyLocation;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch('https://api.indexnow.org/indexnow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const responseText = await response.text();
        let responseData = {};
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = { message: responseText || 'Status received from IndexNow' };
        }

        return new Response(JSON.stringify(responseData), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        const errorMsg = err.name === 'AbortError' ? 'IndexNow request timed out (10s)' : err.message;
        return new Response(JSON.stringify({ error: `IndexNow API submission error: ${errorMsg}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Default action fallback
    return new Response(JSON.stringify({ error: 'Invalid action parameter specified.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Enforces rate limiting on a specific key using KV store.
 * @param {object} kvNamespace The KV binding instance
 * @param {string} key The unique limiter key (e.g. action + IP)
 * @param {number} maxCount Maximum allowed requests inside window
 * @param {number} windowSeconds Timeframe in seconds
 * @returns {Promise<boolean>} True if rate limit is exceeded, False otherwise.
 */
async function enforceRateLimit(kvNamespace, key, maxCount, windowSeconds) {
  if (!kvNamespace) return false; // Fail open if KV is missing (should not happen)

  try {
    const rawRecord = await kvNamespace.get(key);
    let record = { count: 0, timestamp: Date.now() };

    if (rawRecord) {
      record = JSON.parse(rawRecord);
    }

    const elapsed = Date.now() - record.timestamp;
    
    if (elapsed > windowSeconds * 1000) {
      // Window expired, reset counter
      record.count = 1;
      record.timestamp = Date.now();
    } else {
      // Within window
      if (record.count >= maxCount) {
        return true; // Limit exceeded
      }
      record.count++;
    }

    // Save record back with matching TTL expiration
    await kvNamespace.put(key, JSON.stringify(record), {
      expirationTtl: windowSeconds
    });
    
    return false;
  } catch (err) {
    console.error('Rate limiter error:', err);
    return false; // Fail open to keep service running
  }
}
