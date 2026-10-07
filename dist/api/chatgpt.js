function extractShareId(input) {
  if (!input) return null;
  const match = String(input).match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : null;
}

function parseTurboStream(html) {
  const match = html.match(/window\.__reactRouterContext\.streamController\.enqueue\(\"((?:\\\\.|[^\"])*)\"\)/);
  if (!match) return null;

  try {
    const rawJson = JSON.parse('"' + match[1] + '"');
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return null;

    const cache = new Map();
    function unflatten(idx, depth = 0) {
      if (idx < 0 || idx >= parsed.length || depth > 30) return null;
      if (cache.has(idx)) return cache.get(idx);
      const val = parsed[idx];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const res = {};
        cache.set(idx, res);
        for (const [k, v] of Object.entries(val)) {
          if (k.startsWith('_')) {
            const keyIdx = parseInt(k.slice(1), 10);
            const realKey = keyIdx >= 0 && keyIdx < parsed.length ? parsed[keyIdx] : k;
            res[realKey] = typeof v === 'number' && v >= 0 ? unflatten(v, depth + 1) : v;
          } else {
            res[k] = typeof v === 'number' && v >= 0 ? unflatten(v, depth + 1) : v;
          }
        }
        return res;
      } else if (Array.isArray(val)) {
        const res = [];
        cache.set(idx, res);
        for (const x of val) {
          res.push(typeof x === 'number' && x >= 0 ? unflatten(x, depth + 1) : x);
        }
        return res;
      }
      return val;
    }

    // Direct check on frequent data container indices
    for (const testIdx of [8, 12, 11, 10, 13]) {
      const serverResponse = unflatten(testIdx);
      if (serverResponse && serverResponse.data && (serverResponse.data.linear_conversation || serverResponse.data.mapping)) {
        return serverResponse.data;
      }
      if (serverResponse && (serverResponse.linear_conversation || serverResponse.mapping)) {
        return serverResponse;
      }
    }

    // Secondary scan across elements
    for (let i = 0; i < Math.min(parsed.length, 100); i++) {
      const item = unflatten(i);
      if (item && typeof item === 'object') {
        if (item.serverResponse?.data && (item.serverResponse.data.linear_conversation || item.serverResponse.data.mapping)) {
          return item.serverResponse.data;
        }
        if (item.data && (item.data.linear_conversation || item.data.mapping)) {
          return item.data;
        }
        if (item.linear_conversation || item.mapping) {
          return item;
        }
      }
    }
  } catch (_) {}

  return null;
}

async function fetchConversation(shareId) {
  const browserProfiles = [
    {
      name: 'Chrome Desktop',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    },
    {
      name: 'Googlebot',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
    {
      name: 'FacebookExternalHit',
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  ];

  const attempts = [];

  // Strategy 1: Iterate SSR HTML fetching with browser and verified crawler headers
  for (const profile of browserProfiles) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const htmlRes = await fetch(`https://chatgpt.com/share/${shareId}`, {
        signal: controller.signal,
        headers: profile.headers,
      });
      clearTimeout(timeout);

      const status = htmlRes.status;
      if (htmlRes.ok) {
        const htmlText = await htmlRes.text();
        const extracted = parseTurboStream(htmlText);
        if (extracted && (extracted.linear_conversation || extracted.mapping)) {
          return { success: true, data: extracted };
        }
        attempts.push({ profile: profile.name, status, streamParsed: false, htmlLen: htmlText.length });
      } else {
        attempts.push({ profile: profile.name, status });
      }
    } catch (err) {
      attempts.push({ profile: profile.name, error: err.message });
    }
  }

  // Strategy 2: Direct backend-api fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const apiRes = await fetch(`https://chatgpt.com/backend-api/share/${shareId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && (data.linear_conversation || data.mapping)) {
        return { success: true, data };
      }
    }
    attempts.push({ apiStatus: apiRes.status });
  } catch (err) {
    attempts.push({ apiError: err.message });
  }

  return { success: false, status: 404, error: 'Could not extract conversation data from share link.', details: attempts };
}

function sendNodeJson(res, statusCode, data, headers = {}) {
  for (const [key, val] of Object.entries(headers)) {
    if (typeof res.setHeader === 'function') {
      res.setHeader(key, val);
    }
  }
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
  }
  res.end(JSON.stringify(data));
}

async function handleNode(req, res) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  for (const [key, val] of Object.entries(corsHeaders)) {
    if (typeof res.setHeader === 'function') {
      res.setHeader(key, val);
    }
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  let shareParam = null;
  if (req.query && typeof req.query === 'object') {
    shareParam = req.query.shareId || req.query.url;
  }
  if (!shareParam && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      shareParam = parsedUrl.searchParams.get('shareId') || parsedUrl.searchParams.get('url');
    } catch (_) {}
  }
  if (!shareParam && req.body && typeof req.body === 'object') {
    shareParam = req.body.shareId || req.body.url;
  }

  const shareId = extractShareId(shareParam);
  if (!shareId) {
    return sendNodeJson(res, 400, { error: 'Invalid or missing shareId UUID.' });
  }

  const result = await fetchConversation(shareId);
  if (result.success) {
    return sendNodeJson(res, 200, result.data, {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    });
  }

  return sendNodeJson(res, result.status || 500, {
    error: result.error || 'Failed to fetch conversation.',
    details: result.details,
  });
}

async function handleEdge(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url, 'http://localhost');
  let shareParam = url.searchParams.get('shareId') || url.searchParams.get('url');

  if (!shareParam && request.method === 'POST') {
    try {
      const body = await request.json();
      shareParam = body.shareId || body.url;
    } catch (_) {}
  }

  const shareId = extractShareId(shareParam);
  if (!shareId) {
    return new Response(JSON.stringify({ error: 'Invalid or missing shareId UUID.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const result = await fetchConversation(shareId);
  if (result.success) {
    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  }

  return new Response(JSON.stringify({ error: result.error || 'Failed to fetch conversation.', details: result.details }), {
    status: result.status || 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export default async function handler(request, response) {
  try {
    if (response != null) {
      return await handleNode(request, response);
    }
    return await handleEdge(request);
  } catch (fatalErr) {
    if (response != null) {
      return sendNodeJson(response, 500, { error: `Server error: ${fatalErr.message}` });
    }
    return new Response(JSON.stringify({ error: `Server error: ${fatalErr.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
