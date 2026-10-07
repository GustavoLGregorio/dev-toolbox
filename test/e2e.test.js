import chatgptHandler from '../dist/api/chatgpt.js';
import puppeteer from 'puppeteer-core';

async function runTest() {
  const server = Bun.serve({
    port: 3088,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith('/api/chatgpt')) {
        return chatgptHandler(req);
      }
      const filePath = './dist' + (url.pathname === '/' ? '/index.html' : url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);

      const htmlFile = Bun.file(filePath + (filePath.endsWith('/') ? 'index.html' : '/index.html'));
      if (await htmlFile.exists()) return new Response(htmlFile);

      return new Response('Not Found', { status: 404 });
    },
  });

  console.log('Local test server running on http://localhost:3088');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

    await page.goto('http://localhost:3088/chatgpt-exporter/', { waitUntil: 'networkidle2' });

    await page.type('#input-share-url', 'https://chatgpt.com/share/6aa1d178-350c-83e9-a514-4cd6e6698087');
    await page.click('#btn-fetch');

    await page.waitForSelector('#export-card[style*="display: block"]', { timeout: 15000 });

    const chatTitle = await page.$eval('#chat-title', (el) => el.textContent.trim());
    if (!chatTitle.includes('Keystone')) {
      throw new Error(`Expected title 'Keystone', got '${chatTitle}'`);
    }

    // Verify initial Markdown view
    const mdContent = await page.$eval('#preview-panel', (el) => el.textContent);
    if (!mdContent.includes('# Keystone') || !mdContent.includes('## User') || !mdContent.includes('## Assistant')) {
      throw new Error('Markdown output does not contain expected headers and speaker sections');
    }

    // Switch to JSONL tab and verify
    await page.click('#tab-preview-jsonl');
    const jsonlContent = await page.$eval('#preview-panel', (el) => el.textContent);
    const lines = jsonlContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('JSONL output has fewer lines than expected');
    }
    for (const line of lines) {
      const parsed = JSON.parse(line);
      if (!parsed.role || !parsed.content || !parsed.index) {
        throw new Error(`Malformed JSONL line: ${line.slice(0, 50)}`);
      }
    }

    // Switch to Plain Text tab and verify
    await page.click('#tab-preview-txt');
    const txtContent = await page.$eval('#preview-panel', (el) => el.textContent);
    if (!txtContent.includes('Title: Keystone') || !txtContent.includes('[USER]') || !txtContent.includes('[ASSISTANT')) {
      throw new Error('Plain text output does not contain expected format');
    }

    console.log(`E2E Test Passed: Parsed conversation '${chatTitle}' across MD, JSONL, and TXT (${lines.length} turns).`);

    // Verify 1-Click Bookmarklet
    await page.click('#tab-mode-bookmarklet');
    const bookmarkletHref = await page.$eval('#link-bookmarklet', (el) => el.getAttribute('href'));
    if (!bookmarkletHref || !bookmarkletHref.startsWith('javascript:')) {
      throw new Error('Bookmarklet link does not contain valid javascript: URI');
    }
    console.log('E2E Test Passed: Bookmarklet generated with valid javascript: protocol.');

    // Verify Paste HTML / Source mode
    await page.click('#tab-mode-source');
    const sampleJson = JSON.stringify({
      title: 'Pasted Keystone Test',
      linear_conversation: [
        {
          message: {
            id: 'm1',
            author: { role: 'user' },
            content: { parts: ['Hello from raw source test'] }
          }
        },
        {
          message: {
            id: 'm2',
            author: { role: 'assistant' },
            metadata: { model_slug: 'gpt-4o' },
            content: { parts: ['Hello! Raw source extraction successful.'] }
          }
        }
      ]
    });

    await page.$eval('#input-html-source', (el, val) => { el.value = val; }, sampleJson);
    await page.click('#btn-parse-source');
    await page.waitForSelector('#export-card[style*="display: block"]');

    const sourceTitle = await page.$eval('#chat-title', (el) => el.textContent.trim());
    if (sourceTitle !== 'Pasted Keystone Test') {
      throw new Error(`Expected title 'Pasted Keystone Test', got '${sourceTitle}'`);
    }
    console.log('E2E Test Passed: Raw source paste parsed successfully.');

    // Test negative scenario: invalid UUID
    const resInvalid = await fetch('http://localhost:3088/api/chatgpt?shareId=invalid-uuid');
    if (resInvalid.status !== 400) {
      throw new Error(`Expected HTTP 400 for invalid UUID, got ${resInvalid.status}`);
    }
    console.log('E2E Test Passed: Invalid UUID properly returned HTTP 400.');
  } finally {
    await browser.close();
    server.stop();
  }
}

runTest().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
