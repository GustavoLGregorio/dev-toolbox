export const config = {
  runtime: 'edge',
};

function extractShareId(input) {
  if (!input) return null;
  const match = String(input).match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : null;
}

export default async function handler(request, response) {
  // Support both standard Node.js serverless and Vercel Edge Runtime
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const targetUrl = `https://chatgpt.com/backend-api/share/${shareId}`;
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `ChatGPT returned HTTP ${res.status}. The share link may be private or expired.`
      }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const errorMsg = err.name === 'AbortError' ? 'Connection timed out (10s)' : err.message;
    return new Response(JSON.stringify({ error: `Could not fetch conversation: ${errorMsg}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const targetUrl = `https://chatgpt.com/backend-api/share/${shareId}`;
    const upstreamRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: `ChatGPT returned HTTP ${upstreamRes.status}. The share link may be private or expired.`
      });
    }

    const data = await upstreamRes.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (err) {
    const errorMsg = err.name === 'AbortError' ? 'Connection timed out (10s)' : err.message;
    return res.status(500).json({ error: `Could not fetch conversation: ${errorMsg}` });
  }
}
