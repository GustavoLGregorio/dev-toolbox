document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const shareUrlInput = document.getElementById('input-share-url');
  const fetchBtn = document.getElementById('btn-fetch');
  const fetchStatus = document.getElementById('fetch-status');

  const tabModeUrl = document.getElementById('tab-mode-url');
  const tabModeSource = document.getElementById('tab-mode-source');
  const tabModeBookmarklet = document.getElementById('tab-mode-bookmarklet');
  const panelModeUrl = document.getElementById('panel-mode-url');
  const panelModeSource = document.getElementById('panel-mode-source');
  const panelModeBookmarklet = document.getElementById('panel-mode-bookmarklet');
  const htmlSourceInput = document.getElementById('input-html-source');
  const parseSourceBtn = document.getElementById('btn-parse-source');
  const linkBookmarklet = document.getElementById('link-bookmarklet');

  const exportCard = document.getElementById('export-card');
  const chatTitle = document.getElementById('chat-title');
  const chatMeta = document.getElementById('chat-meta');

  const downloadMdBtn = document.getElementById('btn-download-md');
  const downloadJsonlBtn = document.getElementById('btn-download-jsonl');
  const downloadTxtBtn = document.getElementById('btn-download-txt');
  const copyMdBtn = document.getElementById('btn-copy-md');
  const copyFeedback = document.getElementById('copy-feedback');

  const tabPreviewMd = document.getElementById('tab-preview-md');
  const tabPreviewJsonl = document.getElementById('tab-preview-jsonl');
  const tabPreviewTxt = document.getElementById('tab-preview-txt');
  const previewPanel = document.getElementById('preview-panel');

  // State
  let currentData = null;
  let currentTurns = [];
  let currentSourceUrl = '';
  let activePreviewTab = 'md';

  // Bookmarklet Code Setup
  const bookmarkletCode = `javascript:(function(){try{const ctx=window.__reactRouterContext||window.__remixContext;let d=null;if(ctx&&ctx.state&&ctx.state.loaderData){for(const k of Object.keys(ctx.state.loaderData)){const r=ctx.state.loaderData[k];if(r&&r.serverResponse&&r.serverResponse.data){d=r.serverResponse.data;break;}}}if(!d){const m=document.documentElement.outerHTML.match(/window\\.__reactRouterContext\\.streamController\\.enqueue\\(\\"((?:\\\\\\\\.|[^\\"])*)\\"\\)/);if(m){const raw=JSON.parse('"'+m[1]+'"');const p=JSON.parse(raw);function uf(i,dp=0){if(i<0||i>=p.length||dp>30)return null;const v=p[i];if(v&&typeof v==='object'&&!Array.isArray(v)){const res={};for(const[k,val]of Object.entries(v)){const rk=k.startsWith('_')?p[parseInt(k.slice(1),10)]:k;res[rk]=typeof val==='number'&&val>=0?uf(val,dp+1):val;}return res;}else if(Array.isArray(v)){return v.map(x=>(typeof x==='number'&&x>=0?uf(x,dp+1):x));}return v;}for(let i=0;i<Math.min(p.length,100);i++){const it=uf(i);if(it?.serverResponse?.data?.linear_conversation){d=it.serverResponse.data;break;}if(it?.data?.linear_conversation){d=it.data;break;}}}}if(!d){alert('Could not find ChatGPT shared conversation on this page.');return;}const turns=[];for(const item of(d.linear_conversation||[])){const msg=item.message;if(!msg)continue;const role=msg.author?.role;if(role!=='user'&&role!=='assistant')continue;const parts=msg.content?.parts||[];const txt=parts.filter(x=>typeof x==='string').join('\\n\\n').trim();if(txt)turns.push({role,content:txt,model:msg.metadata?.model_slug});}const title=d.title||'ChatGPT Export';const safeTitle=title.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,50);let md='# '+title+'\\n\\n- Source: '+location.href+'\\n- Turns: '+turns.length+'\\n\\n---\\n\\n';for(const t of turns){md+='## '+(t.role==='user'?'User':'Assistant'+(t.model?' ('+t.model+')':''))+'\\n\\n'+t.content+'\\n\\n---\\n\\n';}const blob=new Blob([md],{type:'text/markdown;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=safeTitle+'.md';document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert('Export failed: '+e.message);}})();`;
  if (linkBookmarklet) {
    linkBookmarklet.href = bookmarkletCode;
  }

  // Mode Switcher
  const switchInputMode = (mode) => {
    [tabModeUrl, tabModeSource, tabModeBookmarklet].forEach(t => {
      if (t) {
        t.classList.remove('tab-button--active');
        t.setAttribute('aria-selected', 'false');
      }
    });
    if (panelModeUrl) panelModeUrl.style.display = 'none';
    if (panelModeSource) panelModeSource.style.display = 'none';
    if (panelModeBookmarklet) panelModeBookmarklet.style.display = 'none';

    if (mode === 'url' && tabModeUrl && panelModeUrl) {
      tabModeUrl.classList.add('tab-button--active');
      tabModeUrl.setAttribute('aria-selected', 'true');
      panelModeUrl.style.display = 'block';
    } else if (mode === 'source' && tabModeSource && panelModeSource) {
      tabModeSource.classList.add('tab-button--active');
      tabModeSource.setAttribute('aria-selected', 'true');
      panelModeSource.style.display = 'block';
    } else if (mode === 'bookmarklet' && tabModeBookmarklet && panelModeBookmarklet) {
      tabModeBookmarklet.classList.add('tab-button--active');
      tabModeBookmarklet.setAttribute('aria-selected', 'true');
      panelModeBookmarklet.style.display = 'block';
    }
  };

  if (tabModeUrl) tabModeUrl.addEventListener('click', () => switchInputMode('url'));
  if (tabModeSource) tabModeSource.addEventListener('click', () => switchInputMode('source'));
  if (tabModeBookmarklet) tabModeBookmarklet.addEventListener('click', () => switchInputMode('bookmarklet'));

  // Parser for raw pasted source or JSON
  const parseRawSource = (input) => {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();

    // Case 1: Direct JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.linear_conversation || parsed.mapping) return parsed;
        if (parsed.data && (parsed.data.linear_conversation || parsed.data.mapping)) return parsed.data;
        if (parsed.serverResponse?.data) return parsed.serverResponse.data;
      } catch (_) {}
    }

    // Case 2: Turbo stream in HTML
    const match = trimmed.match(/window\.__reactRouterContext\.streamController\.enqueue\(\"((?:\\\\.|[^\"])*)\"\)/);
    if (match) {
      try {
        const rawJson = JSON.parse('"' + match[1] + '"');
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          function unflatten(idx, depth = 0) {
            if (idx < 0 || idx >= parsed.length || depth > 30) return null;
            const val = parsed[idx];
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const res = {};
              for (const [k, v] of Object.entries(val)) {
                const realKey = k.startsWith('_') ? parsed[parseInt(k.slice(1), 10)] : k;
                res[realKey] = typeof v === 'number' && v >= 0 ? unflatten(v, depth + 1) : v;
              }
              return res;
            } else if (Array.isArray(val)) {
              return val.map((x) => (typeof x === 'number' && x >= 0 ? unflatten(x, depth + 1) : x));
            }
            return val;
          }

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
        }
      } catch (_) {}
    }

    return null;
  };

  // API Endpoint Resolver
  const getApiUrl = (shareId) => {
    // Relative endpoint queries native Vercel serverless function on the same origin
    return `/api/chatgpt?shareId=${encodeURIComponent(shareId)}`;
  };

  // Helper: Extract UUID
  const extractShareId = (input) => {
    const trimmed = input.trim();
    const match = trimmed.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    return match ? match[1] : null;
  };

  // Helper: Sanitize filename
  const sanitizeFilename = (title, defaultName) => {
    if (!title) return defaultName;
    const clean = title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 50);
    return clean || defaultName;
  };

  // Parser: Extract conversation turns from ChatGPT data
  const extractTurns = (data) => {
    const turns = [];

    // Method 1: Try linear_conversation array (default in modern shares)
    if (Array.isArray(data.linear_conversation) && data.linear_conversation.length > 0) {
      for (const item of data.linear_conversation) {
        const msg = item.message;
        if (!msg) continue;

        const role = msg.author?.role;
        if (role !== 'user' && role !== 'assistant') continue;

        const parts = msg.content?.parts || [];
        const textParts = parts.filter(p => typeof p === 'string' && p.trim().length > 0);
        if (textParts.length === 0) continue;

        turns.push({
          id: msg.id,
          role,
          model: msg.metadata?.model_slug || msg.metadata?.resolved_model_slug || null,
          timestamp: msg.create_time || null,
          content: textParts.join('\n\n').trim()
        });
      }
    }

    // Method 2: Fallback to mapping DAG graph traversal if linear_conversation is empty
    if (turns.length === 0 && data.mapping && data.current_node) {
      let nodeId = data.current_node;
      const mappingTurns = [];

      while (nodeId && data.mapping[nodeId]) {
        const node = data.mapping[nodeId];
        const msg = node.message;

        if (msg) {
          const role = msg.author?.role;
          if (role === 'user' || role === 'assistant') {
            const parts = msg.content?.parts || [];
            const textParts = parts.filter(p => typeof p === 'string' && p.trim().length > 0);
            if (textParts.length > 0) {
              mappingTurns.push({
                id: msg.id,
                role,
                model: msg.metadata?.model_slug || msg.metadata?.resolved_model_slug || null,
                timestamp: msg.create_time || null,
                content: textParts.join('\n\n').trim()
              });
            }
          }
        }
        nodeId = node.parent;
      }

      mappingTurns.reverse();
      turns.push(...mappingTurns);
    }

    return turns;
  };

  // Format Generators
  const generateMarkdown = (data, turns, sourceUrl) => {
    const title = (data.title || 'ChatGPT Conversation').trim();
    const dateStr = data.create_time
      ? new Date(data.create_time * 1000).toISOString()
      : new Date().toISOString();

    let md = `# ${title}\n\n`;
    md += `- Source: ${sourceUrl || 'Shared ChatGPT Conversation'}\n`;
    md += `- Date: ${dateStr}\n`;
    md += `- Turns: ${turns.length}\n\n`;
    md += `---\n\n`;

    for (const turn of turns) {
      const speaker = turn.role === 'user' ? 'User' : `Assistant${turn.model ? ` (${turn.model})` : ''}`;
      md += `## ${speaker}\n\n${turn.content}\n\n---\n\n`;
    }

    return md;
  };

  const generateJsonl = (turns) => {
    return turns.map((turn, index) => {
      const obj = {
        index: index + 1,
        role: turn.role,
        content: turn.content
      };
      if (turn.model) obj.model = turn.model;
      if (turn.timestamp) obj.timestamp = turn.timestamp;
      return JSON.stringify(obj);
    }).join('\n') + '\n';
  };

  const generatePlainText = (data, turns, sourceUrl) => {
    const title = (data.title || 'ChatGPT Conversation').trim();
    const dateStr = data.create_time
      ? new Date(data.create_time * 1000).toISOString()
      : new Date().toISOString();

    const separator = '='.repeat(80);
    let txt = `Title: ${title}\n`;
    txt += `Source: ${sourceUrl || 'Shared ChatGPT Conversation'}\n`;
    txt += `Date: ${dateStr}\n`;
    txt += `Total Turns: ${turns.length}\n\n`;

    for (const turn of turns) {
      const speaker = turn.role === 'user' ? 'USER' : `ASSISTANT${turn.model ? ` (${turn.model})` : ''}`;
      txt += `${separator}\n[${speaker}]\n${separator}\n\n`;
      txt += `${turn.content}\n\n`;
    }

    return txt;
  };

  // Trigger File Download
  const triggerDownload = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Status helper
  const showStatus = (msg, type) => {
    fetchStatus.style.display = 'block';
    if (type === 'error') {
      fetchStatus.innerHTML = `<span class="badge badge--error">Error</span> <span style="margin-left: 8px; font-size: var(--font-size-sm); color: var(--badge-error-text);">${msg}</span>`;
    } else if (type === 'success') {
      fetchStatus.innerHTML = `<span class="badge badge--success">Loaded</span> <span style="margin-left: 8px; font-size: var(--font-size-sm);">${msg}</span>`;
    } else {
      fetchStatus.innerHTML = `<span style="font-size: var(--font-size-sm); color: var(--text-muted);">${msg}</span>`;
    }
  };

  // Update UI with Parsed Data
  const renderConversationUI = (data, sourceUrl) => {
    currentData = data;
    currentSourceUrl = sourceUrl;
    currentTurns = extractTurns(data);

    if (currentTurns.length === 0) {
      showStatus('No dialogue messages found in conversation data.', 'error');
      exportCard.style.display = 'none';
      return;
    }

    const title = (data.title || 'Untitled Conversation').trim();
    chatTitle.textContent = title;

    // Calculate metadata
    const userCount = currentTurns.filter(t => t.role === 'user').length;
    const assistantCount = currentTurns.filter(t => t.role === 'assistant').length;
    const totalChars = currentTurns.reduce((acc, t) => acc + t.content.length, 0);
    const modelSlug = currentTurns.find(t => t.model)?.model || data.default_model_slug || 'Standard';

    chatMeta.innerHTML = `
      <span class="badge" style="background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);">${currentTurns.length} turns</span>
      <span class="badge" style="background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);">User: ${userCount}</span>
      <span class="badge" style="background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);">Assistant: ${assistantCount}</span>
      <span class="badge" style="background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);">Model: ${modelSlug}</span>
      <span class="badge" style="background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color);">${(totalChars / 1000).toFixed(1)}k chars</span>
    `;

    exportCard.style.display = 'block';
    updatePreview();
    showStatus(`Successfully parsed "${title}" (${currentTurns.length} turns). Ready to download.`, 'success');
  };

  // Update Preview Panel
  const updatePreview = () => {
    if (!currentData || currentTurns.length === 0) return;

    if (activePreviewTab === 'md') {
      previewPanel.textContent = generateMarkdown(currentData, currentTurns, currentSourceUrl);
    } else if (activePreviewTab === 'jsonl') {
      previewPanel.textContent = generateJsonl(currentTurns);
    } else if (activePreviewTab === 'txt') {
      previewPanel.textContent = generatePlainText(currentData, currentTurns, currentSourceUrl);
    }
  };

  // Preview Tabs switching
  const switchPreviewTab = (tabName, activeBtn) => {
    [tabPreviewMd, tabPreviewJsonl, tabPreviewTxt].forEach(b => {
      b.classList.remove('tab-button--active');
      b.setAttribute('aria-selected', 'false');
    });
    activeBtn.classList.add('tab-button--active');
    activeBtn.setAttribute('aria-selected', 'true');
    activePreviewTab = tabName;
    updatePreview();
  };

  tabPreviewMd.addEventListener('click', () => switchPreviewTab('md', tabPreviewMd));
  tabPreviewJsonl.addEventListener('click', () => switchPreviewTab('jsonl', tabPreviewJsonl));
  tabPreviewTxt.addEventListener('click', () => switchPreviewTab('txt', tabPreviewTxt));

  // Action: Fetch remote chat via serverless proxy
  const fetchSharedChat = async () => {
    const rawInput = shareUrlInput.value.trim();
    const shareId = extractShareId(rawInput);

    if (!shareId) {
      showStatus('Please enter a valid ChatGPT share URL or UUID.', 'error');
      return;
    }

    fetchBtn.classList.add('button--disabled');
    fetchBtn.disabled = true;
    showStatus('Fetching conversation from ChatGPT...', 'info');

    try {
      let response = await fetch(getApiUrl(shareId), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      // Fallback for local emulator if running outside Vercel dev
      if (!response.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        try {
          const fallbackUrl = `http://localhost:8787/api/chatgpt?action=chatgpt_share&shareId=${encodeURIComponent(shareId)}`;
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareId })
          });
          if (fallbackResp.ok) {
            response = fallbackResp;
          }
        } catch (_) {}
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      renderConversationUI(data, rawInput.startsWith('http') ? rawInput : `https://chatgpt.com/share/${shareId}`);
    } catch (err) {
      if (err.message && (err.message.includes('403') || err.message.includes('bot') || err.message.includes('Could not extract'))) {
        showStatus('Cloudflare bot protection blocked automated cloud fetch. Switch to the "Paste HTML / Source" tab or use the "1-Click Bookmarklet" for instant 100% private export.', 'error');
      } else {
        showStatus(`Failed to fetch chat: ${err.message}`, 'error');
      }
    } finally {
      fetchBtn.classList.remove('button--disabled');
      fetchBtn.disabled = false;
    }
  };

  fetchBtn.addEventListener('click', fetchSharedChat);
  shareUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchSharedChat();
    }
  });

  // Action: Parse raw pasted source
  if (parseSourceBtn) {
    parseSourceBtn.addEventListener('click', () => {
      const raw = htmlSourceInput?.value?.trim();
      if (!raw) {
        showStatus('Please paste HTML page source or JSON into the field.', 'error');
        return;
      }

      showStatus('Parsing conversation data from source...', 'info');
      const data = parseRawSource(raw);
      if (!data) {
        showStatus('Could not find conversation data in the pasted content. Make sure to paste the full page source (Ctrl+U from the shared chat page).', 'error');
        return;
      }

      renderConversationUI(data, 'Pasted ChatGPT Source');
    });
  }

  // Export Download handlers
  downloadMdBtn.addEventListener('click', () => {
    if (!currentData || currentTurns.length === 0) return;
    const content = generateMarkdown(currentData, currentTurns, currentSourceUrl);
    const filename = `${sanitizeFilename(currentData.title, 'chatgpt_export')}.md`;
    triggerDownload(content, filename, 'text/markdown;charset=utf-8');
  });

  downloadJsonlBtn.addEventListener('click', () => {
    if (!currentData || currentTurns.length === 0) return;
    const content = generateJsonl(currentTurns);
    const filename = `${sanitizeFilename(currentData.title, 'chatgpt_export')}.jsonl`;
    triggerDownload(content, filename, 'application/x-ndjson;charset=utf-8');
  });

  downloadTxtBtn.addEventListener('click', () => {
    if (!currentData || currentTurns.length === 0) return;
    const content = generatePlainText(currentData, currentTurns, currentSourceUrl);
    const filename = `${sanitizeFilename(currentData.title, 'chatgpt_export')}.txt`;
    triggerDownload(content, filename, 'text/plain;charset=utf-8');
  });

  copyMdBtn.addEventListener('click', async () => {
    if (!currentData || currentTurns.length === 0) return;
    const content = generateMarkdown(currentData, currentTurns, currentSourceUrl);

    try {
      await navigator.clipboard.writeText(content);
      copyFeedback.style.display = 'block';
      setTimeout(() => {
        copyFeedback.style.display = 'none';
      }, 2500);
    } catch (err) {
      alert('Unable to copy to clipboard.');
    }
  });
});
