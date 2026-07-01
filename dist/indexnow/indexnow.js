document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Config Section
  const domainInput = document.getElementById('input-domain');
  const keyInput = document.getElementById('input-key');
  const keyLocationInput = document.getElementById('input-key-location');
  const generateKeyBtn = document.getElementById('btn-generate-key');
  const downloadKeyBtn = document.getElementById('btn-download-key');
  const verifySetupBtn = document.getElementById('btn-verify-setup');
  const verifyStatusDiv = document.getElementById('verify-status');
  const skipVerifyCheckbox = document.getElementById('check-skip-verify');

  // DOM Elements - URL Loading Section
  const tabManual = document.getElementById('tab-manual');
  const tabSitemap = document.getElementById('tab-sitemap');
  const tabFile = document.getElementById('tab-file');
  const panelManual = document.getElementById('panel-manual');
  const panelSitemap = document.getElementById('panel-sitemap');
  const panelFile = document.getElementById('panel-file');

  const urlsTextarea = document.getElementById('textarea-urls');
  const sitemapUrlInput = document.getElementById('input-sitemap-url');
  const fetchSitemapBtn = document.getElementById('btn-fetch-sitemap');
  const sitemapFetchStatusDiv = document.getElementById('sitemap-fetch-status');

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const dropZoneInfo = document.getElementById('drop-zone-info');

  const urlCountSpan = document.getElementById('url-count');
  const clearUrlsBtn = document.getElementById('btn-clear-urls');

  // DOM Elements - Submit Section
  const submitBtn = document.getElementById('btn-submit');
  const submitLoader = document.getElementById('submit-loader');
  const submitStatusDiv = document.getElementById('submit-status');
  const resultsConsole = document.getElementById('results-console');

  // State
  let loadedUrls = [];
  let hasCustomSitemap = false;
  let hasCustomKeyLocation = false;

  // ==========================================
  // 0. API Endpoint Resolver
  // ==========================================
  const getApiUrl = (action) => {
    // If testing locally (localhost), query wrangler dev server on port 8787.
    // Otherwise, query the deployed Cloudflare Worker URL.
    const base = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8787'
      : 'https://dev-toolbox-indexnow.gustavo-l-gregorio.workers.dev';
    return `${base}/api/indexnow?action=${action}`;
  };

  // ==========================================
  // 1. Initial State & LocalStorage
  // ==========================================
  const loadStoredConfig = () => {
    const storedDomain = localStorage.getItem('indexnow_domain');
    const storedKey = localStorage.getItem('indexnow_key');
    const storedLocation = localStorage.getItem('indexnow_key_location');
    const storedSitemap = localStorage.getItem('indexnow_sitemap');

    if (storedDomain) domainInput.value = storedDomain;
    if (storedKey) keyInput.value = storedKey;
    
    if (storedLocation) {
      keyLocationInput.value = storedLocation;
      hasCustomKeyLocation = true;
    }
    
    if (storedSitemap) {
      sitemapUrlInput.value = storedSitemap;
      hasCustomSitemap = true;
    }

    // Run calculation to populate empty defaults
    updateKeyLocationAndSitemap();
  };

  const saveConfigToStorage = () => {
    localStorage.setItem('indexnow_domain', domainInput.value.trim());
    localStorage.setItem('indexnow_key', keyInput.value.trim());
    localStorage.setItem('indexnow_key_location', keyLocationInput.value.trim());
    localStorage.setItem('indexnow_sitemap', sitemapUrlInput.value.trim());
  };

  // ==========================================
  // 2. Key Generation & Downloading
  // ==========================================
  const generateRandomKey = () => {
    // Generate a random 32-character hex key
    const chars = '0123456789abcdef';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    keyInput.value = key;
    updateKeyLocationAndSitemap();
  };

  const updateKeyLocationAndSitemap = () => {
    const rawDomain = domainInput.value.trim();
    const cleanDomain = rawDomain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const key = keyInput.value.trim();

    if (!rawDomain) {
      // If domain is empty, reset flags so next domain entry re-generates everything
      hasCustomKeyLocation = false;
      hasCustomSitemap = false;
      keyLocationInput.value = '';
      sitemapUrlInput.value = '';
      toggleDownloadButton();
      return;
    }

    // Auto-update Key Location URL if not customized by user
    if (!hasCustomKeyLocation) {
      if (key) {
        keyLocationInput.value = `https://${cleanDomain}/${key}.txt`;
      } else {
        keyLocationInput.value = `https://${cleanDomain}/your-key.txt`;
      }
    }

    // Auto-update Sitemap URL if not customized by user
    if (!hasCustomSitemap) {
      sitemapUrlInput.value = `https://${cleanDomain}/sitemap.xml`;
    }

    toggleDownloadButton();
  };

  const toggleDownloadButton = () => {
    const key = keyInput.value.trim();
    const domain = domainInput.value.trim();
    
    if (key && domain && key.length >= 8) {
      downloadKeyBtn.classList.remove('button--disabled');
      downloadKeyBtn.disabled = false;
    } else {
      downloadKeyBtn.classList.add('button--disabled');
      downloadKeyBtn.disabled = true;
    }
  };

  const downloadKeyFile = () => {
    const key = keyInput.value.trim();
    if (!key) return;

    const blob = new Blob([key], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${key}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ==========================================
  // 3. Server-Side Key Pre-Verification
  // ==========================================
  const verifyKeyHosting = async () => {
    let key = keyInput.value.trim();
    const keyLocation = keyLocationInput.value.trim();

    // Auto-extract key if empty but keyLocation is present
    if (!key && keyLocation) {
      const match = keyLocation.match(/\/([a-f0-9]{8,32})\.txt$/i);
      if (match && match[1]) {
        key = match[1];
        keyInput.value = key;
        updateKeyLocationAndSitemap();
      }
    }

    if (!key || !keyLocation) {
      showVerifyStatus('Please fill in the Website Domain and API Key (or paste a valid Key Location URL containing the key filename).', 'error');
      return false;
    }

    showVerifyStatus('Contacting server to verify key file accessibility...', 'info');
    saveConfigToStorage();

    try {
      const response = await fetch(getApiUrl('verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, keyLocation })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        showVerifyStatus('Key verified successfully! The key file is hosted correctly and matches.', 'success');
        return true;
      } else {
        showVerifyStatus(`Verification failed: ${data.error}`, 'error');
        return false;
      }
    } catch (err) {
      showVerifyStatus(`Request error: ${err.message}`, 'error');
      return false;
    }
  };

  const showVerifyStatus = (message, type) => {
    verifyStatusDiv.style.display = 'block';
    verifyStatusDiv.className = ''; // Reset classes
    
    if (type === 'success') {
      verifyStatusDiv.innerHTML = `<span class="badge badge--success">Success</span> <span style="margin-left:8px; font-size:var(--font-size-sm);">${message}</span>`;
    } else if (type === 'error') {
      verifyStatusDiv.innerHTML = `<span class="badge badge--error">Error</span> <span style="margin-left:8px; font-size:var(--font-size-sm); color:var(--badge-error-text);">${message}</span>`;
    } else {
      verifyStatusDiv.innerHTML = `<span style="font-size:var(--font-size-sm); color:var(--text-muted);">${message}</span>`;
    }
  };

  // ==========================================
  // 4. URL Loading & Deduplication
  // ==========================================
  const updateUrlListAndCount = () => {
    // Collect from textarea
    const text = urlsTextarea.value;
    const urls = text
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0 && (url.startsWith('http://') || url.startsWith('https://')));
    
    // Deduplicate
    loadedUrls = [...new Set(urls)];
    urlCountSpan.textContent = loadedUrls.length;
  };

  const addUrlsToTextarea = (urls) => {
    const currentText = urlsTextarea.value.trim();
    const existingLines = currentText ? currentText.split('\n') : [];
    
    const combined = [...existingLines, ...urls]
      .map(u => u.trim())
      .filter(u => u.length > 0);
    
    const unique = [...new Set(combined)];
    urlsTextarea.value = unique.join('\n');
    updateUrlListAndCount();
  };

  // Fetch Sitemap via serverless proxy
  const fetchRemoteSitemap = async () => {
    const sitemapUrl = sitemapUrlInput.value.trim();
    if (!sitemapUrl) {
      showSitemapFetchStatus('Please specify a sitemap URL.', 'error');
      return;
    }

    showSitemapFetchStatus('Downloading and parsing sitemap...', 'info');

    try {
      const response = await fetch(getApiUrl('sitemap'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      // Parse errors check
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Fetched file was not valid XML.');
      }

      const locElements = xmlDoc.getElementsByTagName('loc');
      const urls = [];
      for (let i = 0; i < locElements.length; i++) {
        urls.push(locElements[i].textContent.trim());
      }

      if (urls.length === 0) {
        showSitemapFetchStatus('No URLs found inside sitemap.xml. Check file contents.', 'error');
      } else {
        addUrlsToTextarea(urls);
        showSitemapFetchStatus(`Success! Extracted ${urls.length} URLs. Switched back to manual list to view.`, 'success');
        // Automatically switch back to manual tab to show loaded URLs
        setTimeout(() => switchTab(tabManual, panelManual), 1500);
      }
    } catch (err) {
      showSitemapFetchStatus(`Failed to parse sitemap: ${err.message}`, 'error');
    }
  };

  const showSitemapFetchStatus = (message, type) => {
    sitemapFetchStatusDiv.style.display = 'block';
    if (type === 'success') {
      sitemapFetchStatusDiv.innerHTML = `<span class="badge badge--success">Success</span> <span style="margin-left: 8px; font-size: var(--font-size-sm);">${message}</span>`;
    } else if (type === 'error') {
      sitemapFetchStatusDiv.innerHTML = `<span class="badge badge--error">Error</span> <span style="margin-left: 8px; font-size: var(--font-size-sm); color: var(--badge-error-text);">${message}</span>`;
    } else {
      sitemapFetchStatusDiv.innerHTML = `<span style="font-size: var(--font-size-sm); color: var(--text-muted);">${message}</span>`;
    }
  };

  // Local File Upload / Drop Parser
  const parseLocalFile = (file) => {
    const reader = new FileReader();
    dropZoneInfo.style.display = 'block';
    dropZoneInfo.textContent = `Reading ${file.name}...`;

    reader.onload = (e) => {
      const content = e.target.result;
      const fileName = file.name.toLowerCase();

      try {
        if (fileName.endsWith('.xml')) {
          // Parse XML sitemap
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'text/xml');
          
          if (xmlDoc.querySelector('parsererror')) {
            throw new Error('Invalid XML file formatting.');
          }

          const locElements = xmlDoc.getElementsByTagName('loc');
          const urls = [];
          for (let i = 0; i < locElements.length; i++) {
            urls.push(locElements[i].textContent.trim());
          }

          if (urls.length === 0) {
            throw new Error('No <loc> tags found in XML file.');
          }

          addUrlsToTextarea(urls);
          dropZoneInfo.className = 'drop-zone__file-info';
          dropZoneInfo.innerHTML = `<span class="badge badge--success">Parsed</span> Loaded ${urls.length} URLs from XML sitemap.`;
          setTimeout(() => switchTab(tabManual, panelManual), 1500);

        } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
          // Parse CSV or raw TXT line-by-line
          const lines = content.split('\n');
          const urls = [];
          
          // Regex to identify simple URLs
          const urlRegex = /https?:\/\/[^\s,]+/i;

          lines.forEach(line => {
            const match = line.match(urlRegex);
            if (match) {
              urls.push(match[0].trim());
            }
          });

          if (urls.length === 0) {
            throw new Error('No valid HTTP/HTTPS URLs found in the text file.');
          }

          addUrlsToTextarea(urls);
          dropZoneInfo.className = 'drop-zone__file-info';
          dropZoneInfo.innerHTML = `<span class="badge badge--success">Parsed</span> Loaded ${urls.length} URLs from text/CSV file.`;
          setTimeout(() => switchTab(tabManual, panelManual), 1500);

        } else {
          throw new Error('Unsupported file extension. Please use .xml, .csv, or .txt.');
        }
      } catch (err) {
        dropZoneInfo.className = 'drop-zone__file-info';
        dropZoneInfo.innerHTML = `<span class="badge badge--error">Error</span> ${err.message}`;
      }
    };

    reader.onerror = () => {
      dropZoneInfo.className = 'drop-zone__file-info';
      dropZoneInfo.innerHTML = `<span class="badge badge--error">Error</span> Failed to read file.`;
    };

    reader.readAsText(file);
  };

  // ==========================================
  // 5. Submit to IndexNow
  // ==========================================
  const submitToIndexNow = async () => {
    const host = domainInput.value.trim().replace(/^(https?:\/\/)?(www\.)?/, '');
    const key = keyInput.value.trim();
    const keyLocation = keyLocationInput.value.trim();

    // Re-verify list before final submit
    updateUrlListAndCount();

    if (!host) {
      showSubmitStatus('Please enter a Website Domain.', 'error');
      return;
    }
    if (!key || key.length < 8) {
      showSubmitStatus('Please enter a valid API Key (at least 8 characters).', 'error');
      return;
    }
    if (loadedUrls.length === 0) {
      showSubmitStatus('Please add at least one URL to submit.', 'error');
      return;
    }

    // Save inputs in storage for next time
    saveConfigToStorage();

    // 1. Run Pre-verification unless explicitly skipped
    if (!skipVerifyCheckbox.checked) {
      const isVerified = await verifyKeyHosting();
      if (!isVerified) {
        showSubmitStatus('Submission aborted: Pre-verification failed. If you know this is incorrect, check the bypass option to proceed.', 'error');
        return;
      }
    }

    // 2. Perform submission proxy
    submitBtn.classList.add('button--disabled');
    submitBtn.disabled = true;
    submitLoader.style.display = 'block';
    submitStatusDiv.style.display = 'none';
    resultsConsole.style.display = 'none';

    try {
      const response = await fetch(getApiUrl('submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          key,
          keyLocation: keyLocation || undefined,
          urlList: loadedUrls
        })
      });

      const responseCode = response.status;
      const data = await response.json().catch(() => ({}));
      
      // Update logs console
      resultsConsole.style.display = 'block';
      resultsConsole.textContent = `>>> POST /api/indexnow?action=submit\n` +
        `>>> Status Code: ${responseCode} ${response.statusText}\n` +
        `>>> JSON Payload Sent:\n${JSON.stringify({ host, key, keyLocation, urlsCount: loadedUrls.length }, null, 2)}\n\n` +
        `>>> Response Body from IndexNow:\n${JSON.stringify(data, null, 2)}`;

      if (responseCode === 200) {
        showSubmitStatus('Success! URLs successfully submitted to IndexNow. Search engines have queued them.', 'success');
      } else if (responseCode === 202) {
        showSubmitStatus('Accepted. Key verification file matches, index requests are queued.', 'success');
      } else {
        let expl = 'IndexNow server returned an error.';
        if (responseCode === 400) expl = 'Bad Request: Invalid payload or key formats.';
        if (responseCode === 403) expl = 'Forbidden: Key mismatch or invalid domain verification.';
        if (responseCode === 422) expl = 'Unprocessable: URLs belong to a different domain host.';
        
        showSubmitStatus(`Submission failed: HTTP ${responseCode}. ${expl}`, 'error');
      }

    } catch (err) {
      showSubmitStatus(`Network error during submit: ${err.message}`, 'error');
    } finally {
      submitBtn.classList.remove('button--disabled');
      submitBtn.disabled = false;
      submitLoader.style.display = 'none';
    }
  };

  const showSubmitStatus = (message, type) => {
    submitStatusDiv.style.display = 'block';
    if (type === 'success') {
      submitStatusDiv.innerHTML = `<span class="badge badge--success">Success</span> <span style="margin-left: 8px; font-size: var(--font-size-base); font-weight: 500;">${message}</span>`;
    } else if (type === 'error') {
      submitStatusDiv.innerHTML = `<span class="badge badge--error">Error</span> <span style="margin-left: 8px; font-size: var(--font-size-base); font-weight: 500; color: var(--badge-error-text);">${message}</span>`;
    } else {
      submitStatusDiv.innerHTML = `<span style="font-size: var(--font-size-sm); color: var(--text-muted);">${message}</span>`;
    }
  };

  // ==========================================
  // 6. Navigation Tabs & Event Listeners
  // ==========================================
  const switchTab = (activeTabButton, activePanel) => {
    // Reset all tabs
    [tabManual, tabSitemap, tabFile].forEach(btn => {
      btn.classList.remove('tab-button--active');
      btn.setAttribute('aria-selected', 'false');
    });
    [panelManual, panelSitemap, panelFile].forEach(panel => {
      panel.style.display = 'none';
    });

    // Activate selected
    activeTabButton.classList.add('tab-button--active');
    activeTabButton.setAttribute('aria-selected', 'true');
    activePanel.style.display = 'block';
  };

  // Event Listeners: Tab switcher
  tabManual.addEventListener('click', () => switchTab(tabManual, panelManual));
  tabSitemap.addEventListener('click', () => switchTab(tabSitemap, panelSitemap));
  tabFile.addEventListener('click', () => switchTab(tabFile, panelFile));

  // Event Listeners: Key & domain inputs
  domainInput.addEventListener('input', () => {
    updateKeyLocationAndSitemap();
  });
  
  keyInput.addEventListener('input', () => {
    updateKeyLocationAndSitemap();
  });

  keyLocationInput.addEventListener('input', () => {
    hasCustomKeyLocation = true;
    const urlVal = keyLocationInput.value.trim();
    // Match standard hex keys between 8 and 32 chars in filename
    const match = urlVal.match(/\/([a-f0-9]{8,32})\.txt$/i);
    if (match && match[1]) {
      keyInput.value = match[1];
    }
    toggleDownloadButton();
  });

  sitemapUrlInput.addEventListener('input', () => {
    hasCustomSitemap = true;
  });
  
  generateKeyBtn.addEventListener('click', generateRandomKey);
  downloadKeyBtn.addEventListener('click', downloadKeyFile);
  verifySetupBtn.addEventListener('click', verifyKeyHosting);

  // Event Listeners: URL Textarea changes
  urlsTextarea.addEventListener('input', updateUrlListAndCount);
  clearUrlsBtn.addEventListener('click', () => {
    urlsTextarea.value = '';
    updateUrlListAndCount();
  });

  // Event Listeners: Remote sitemap fetch
  fetchSitemapBtn.addEventListener('click', fetchRemoteSitemap);

  // Event Listeners: Drag & Drop local file
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      parseLocalFile(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--hover');
  });

  ['dragleave', 'dragend'].forEach(event => {
    dropZone.addEventListener(event, () => {
      dropZone.classList.remove('drop-zone--hover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--hover');
    if (e.dataTransfer.files.length > 0) {
      parseLocalFile(e.dataTransfer.files[0]);
    }
  });

  // Event Listeners: Final Submit
  submitBtn.addEventListener('click', submitToIndexNow);

  // Initialize
  loadStoredConfig();
  updateUrlListAndCount();
});
