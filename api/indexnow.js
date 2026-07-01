/**
 * Vercel Serverless Function proxy for dev.gregorium.com IndexNow tool.
 * Handles key pre-verification, XML sitemap proxying, and submitting URLs to the IndexNow protocol.
 */
export default async function handler(req, res) {
  // CORS check & HTTP method restriction
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action } = req.query;

  // 1. Key Verification Proxy
  if (action === 'verify') {
    const { key, keyLocation } = req.body;
    if (!key || !keyLocation) {
      return res.status(400).json({ error: 'Missing key or keyLocation' });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(keyLocation, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(200).json({
          success: false,
          error: `Verification file unreachable. Status: ${response.status} ${response.statusText}`
        });
      }

      const bodyText = (await response.text()).trim();
      const targetKey = key.trim();

      if (bodyText === targetKey) {
        return res.status(200).json({ success: true });
      } else {
        // Truncate output in logs/responses for safety
        const truncatedContent = bodyText.substring(0, 100);
        return res.status(200).json({
          success: false,
          error: `Key mismatch. The file at keyLocation contains "${truncatedContent}..." instead of "${targetKey}".`
        });
      }
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Connection timed out (5s)' : err.message;
      return res.status(200).json({
        success: false,
        error: `Could not reach verification URL: ${errorMsg}`
      });
    }
  }

  // 2. XML Sitemap Loader (CORS Proxy)
  else if (action === 'sitemap') {
    const { sitemapUrl } = req.body;
    if (!sitemapUrl) {
      return res.status(400).json({ error: 'Missing sitemapUrl' });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(400).json({ error: `Sitemap file unreachable. Status: ${response.status}` });
      }

      const bodyText = await response.text();
      // Enforce 2MB size limit to avoid serverless function exhaustion
      if (bodyText.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Sitemap size limits exceeded (Max: 2MB).' });
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(bodyText);
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Connection timed out (8s)' : err.message;
      return res.status(500).json({ error: `Could not fetch sitemap: ${errorMsg}` });
    }
  }

  // 3. IndexNow Submit proxy
  else if (action === 'submit') {
    const { host, key, keyLocation, urlList } = req.body;
    if (!host || !key || !urlList || !Array.isArray(urlList)) {
      return res.status(400).json({ error: 'Missing required parameters: host, key, and urlList' });
    }

    if (urlList.length === 0) {
      return res.status(400).json({ error: 'urlList must contain at least one URL.' });
    }

    try {
      const payload = { host, key, urlList };
      if (keyLocation) {
        payload.keyLocation = keyLocation;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // POST to official IndexNow endpoint
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

      // Return matching status back to frontend
      return res.status(response.status).json({
        status: response.status,
        statusText: response.statusText,
        message: responseText || 'Status received from IndexNow'
      });
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'IndexNow request timed out (10s)' : err.message;
      return res.status(500).json({ error: `IndexNow API submission error: ${errorMsg}` });
    }
  }

  // Action mismatch
  else {
    return res.status(400).json({ error: 'Invalid action parameter specified.' });
  }
}
