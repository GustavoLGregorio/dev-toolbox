export const config = {
  runtime: 'edge',
};

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

    function unflatten(idx, depth = 0) {
      if (idx < 0 || idx >= parsed.length || depth > 30) return null;
      const val = parsed[idx];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const res = {};
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
        return val.map((x) => (typeof x === 'number' && x >= 0 ? unflatten(x, depth + 1) : x));
      }
      return val;
    }

    const serverResponse = unflatten(12);
    if (serverResponse && serverResponse.data && (serverResponse.data.linear_conversation || serverResponse.data.mapping)) {
      return serverResponse.data;
    }

    // Secondary scan across top level elements
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
  const userAgents = [
    'Twitterbot/1.0',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  const attempts = [];

  // Strategy 1: Iterate SSR HTML fetching with crawler profiles allowed through WAF
  for (const ua of userAgents) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const htmlRes = await fetch(`https://chatgpt.com/share/${shareId}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      clearTimeout(timeout);

      const status = htmlRes.status;
      if (htmlRes.ok) {
        const htmlText = await htmlRes.text();
        const extracted = parseTurboStream(htmlText);
        if (extracted && (extracted.linear_conversation || extracted.mapping)) {
          return { success: true, data: extracted };
        }
        attempts.push({ ua: ua.slice(0, 15), status, streamParsed: false, htmlLen: htmlText.length });
      } else {
        attempts.push({ ua: ua.slice(0, 15), status });
      }
    } catch (err) {
      attempts.push({ ua: ua.slice(0, 15), error: err.message });
    }
  }

  // Strategy 2: Direct backend-api fallback
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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

export default async function handler(request, response) {
  if (response && typeof response.status === 'function') {
    return handleNode(request, response);
  }
  return handleEdge(request);
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

  const url = new URL(request.url);
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

async function handleNode(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const query = req.query || {};
  let shareParam = query.shareId || query.url;

  if (!shareParam && req.body) {
    shareParam = req.body.shareId || req.body.url;
  }

  const shareId = extractShareId(shareParam);
  if (!shareId) {
    return res.status(400).json({ error: 'Invalid or missing shareId UUID.' });
  }

  const result = await fetchConversation(shareId);
  if (result.success) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(result.data);
  }

  return res.status(result.status || 500).json({ error: result.error || 'Failed to fetch conversation.', details: result.details });
}
