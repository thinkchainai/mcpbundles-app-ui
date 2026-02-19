const state = {
  data: null,
  mcpInitialized: false,
  nextRequestId: 1,
  toolName: null,
  lastToolInput: null
};
const pendingRequests = new Map();

function extractData(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.structuredContent && typeof o.structuredContent === 'object') return o.structuredContent;
  if (o.content && Array.isArray(o.content)) {
    for (var i = 0; i < o.content.length; i++) {
      if (o.content[i] && o.content[i].type === 'text' && typeof o.content[i].text === 'string') {
        try { var parsed = JSON.parse(o.content[i].text); if (parsed && typeof parsed === 'object') return parsed; } catch(e) {}
      }
    }
  }
  if (o.result && typeof o.result === 'object') return extractData(o.result);
  return o;
}

function initializeMCP() {
  console.log('[Dashboard] Initializing MCP connection...');
  const id = state.nextRequestId++;

  window.parent.postMessage({
    jsonrpc: '2.0',
    id: id,
    method: 'ui/initialize',
    params: {
      appCapabilities: {},
      appInfo: { name: 'Dashboard', version: '1.0.0' },
      protocolVersion: '2025-06-18'
    }
  }, '*');

  pendingRequests.set(id, (result) => {
    console.log('[Dashboard] Initialized:', result);
    state.mcpInitialized = true;

    if (result.hostContext?.toolInfo?.tool?.name) {
      state.toolName = result.hostContext.toolInfo.tool.name;
      console.log('[Dashboard] Tool name:', state.toolName);
    }

    window.parent.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/initialized',
      params: {}
    }, '*');
  });
}

async function callTool(name, args = {}) {
  if (!state.mcpInitialized) {
    showError('MCP not initialized');
    return;
  }

  console.log('[Dashboard] Calling tool:', name, args);
  const id = state.nextRequestId++;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, resolve);
    window.parent.postMessage({
      jsonrpc: '2.0',
      id: id,
      method: 'tools/call',
      params: { name, arguments: args }
    }, '*');

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 60000);
  });
}

async function sendMessage(text, role = 'user') {
  const id = state.nextRequestId++;
  return new Promise((resolve, reject) => {
    window.parent.postMessage({
      jsonrpc: '2.0',
      id: id,
      method: 'ui/message',
      params: {
        role: role,
        content: [{ type: 'text', text: text }]
      }
    }, '*');
    pendingRequests.set(id, resolve);
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Message timeout'));
      }
    }, 30000);
  });
}

async function askAI(question, context = null) {
  let messageText = question;
  if (context) {
    const contextStr = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
    messageText = '[Dashboard Context]\n' + contextStr + '\n\n' + question;
  }
  try {
    await sendMessage(messageText, 'user');
    console.log('[Dashboard] Message sent to AI');
  } catch (e) {
    console.error('[Dashboard] Failed to send message:', e);
    showError('Failed to send message to AI');
  }
}

window._sectionHandlers = {};

function renderSectionHeader(title, options = {}) {
  const { id, onRefresh, onExport, getAskAIContext, badge, badgeColor } = options;
  const sectionId = id || title.toLowerCase().replace(/\s+/g, '-');

  if (onRefresh) window._sectionHandlers[sectionId + '_refresh'] = onRefresh;
  if (onExport) window._sectionHandlers[sectionId + '_export'] = onExport;
  if (getAskAIContext) window._sectionHandlers[sectionId + '_askAI'] = getAskAIContext;

  const badgeHtml = badge ? `<span style="font-size:0.7rem;padding:2px 8px;background:${badgeColor || 'var(--text-muted)'};color:white;border-radius:10px">${badge}</span>` : '';

  let btns = '';
  if (onRefresh) btns += `<button class="section-btn" data-action="refresh" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Refresh</button>`;
  if (onExport) btns += `<button class="section-btn" data-action="export" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Export</button>`;
  if (getAskAIContext) btns += `<button class="section-btn section-btn-primary" data-action="askAI" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Ask AI</button>`;

  setTimeout(() => attachSectionHandlers(sectionId), 0);

  return `<div class="section-header"><h3 class="section-header-title">${title}${badgeHtml}</h3><div class="section-header-actions">${btns}</div></div>`;
}

function attachSectionHandlers(sectionId) {
  document.querySelectorAll(`[data-id="${sectionId}"]`).forEach(btn => {
    const action = btn.dataset.action;
    btn.onclick = async () => {
      const handler = window._sectionHandlers[sectionId + '_' + action];
      if (!handler) return;
      if (action === 'askAI') {
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Asking...';
        try {
          const { question, context } = handler();
          await askAI(question, context);
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalHTML;
        }
      } else {
        await handler();
      }
    };
  });
}

const ICONS = {
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
  ai: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  export: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  spinner: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg>'
};

function setHeaderActions(actions) {
  const container = document.getElementById('header-actions');
  if (!container) return;

  container.innerHTML = '';

  actions.forEach((action, index) => {
    const btn = document.createElement('button');
    btn.className = action.primary ? 'header-action-btn header-action-btn-primary' : 'header-action-btn';
    const icon = ICONS[action.icon] || '';
    btn.innerHTML = `${icon} ${action.label}`;
    btn.dataset.actionIndex = index;

    window._headerActions = window._headerActions || [];
    window._headerActions[index] = action.onClick;

    btn.onclick = async () => {
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${ICONS.spinner} Working...`;
      try {
        await action.onClick();
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    };

    container.appendChild(btn);
  });
}

function clearHeaderActions() {
  const container = document.getElementById('header-actions');
  if (container) container.innerHTML = '';
  window._headerActions = [];
}

function addViewActions(getContext, onRefresh) {
  const actions = [];

  if (onRefresh) {
    actions.push({
      label: 'Refresh',
      icon: 'refresh',
      onClick: onRefresh
    });
  }

  actions.push({
    label: 'Ask AI about this view',
    icon: 'ai',
    onClick: async () => {
      const { question, context } = getContext();
      await askAI(question, context);
    },
    primary: true
  });

  setHeaderActions(actions);
}

function addFloatingAskAIButton(getContext) {
  addViewActions(getContext);
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.jsonrpc !== '2.0') return;

  console.log('[Dashboard] Received:', msg);

  if (msg.id && pendingRequests.has(msg.id)) {
    const handler = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    if (msg.result !== undefined) handler(msg.result);
    else if (msg.error) showError(msg.error.message);
    return;
  }

  if (msg.method === 'ui/notifications/tool-input') {
    state.lastToolInput = (msg.params && msg.params.arguments) || (msg.params && msg.params.input) || msg.params || null;
  }

  if (msg.method === 'ui/notifications/tool-result') {
    const data = extractData(msg.params);
    if (data) {
      state.data = data;
      renderDashboard(data);
    }
  }
});

function showError(message) {
  const banner = document.getElementById('error-banner');
  const msgEl = document.getElementById('error-message');
  msgEl.textContent = message;
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), 5000);
}

function showLoading(container, message = 'Loading...', overlay = false) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;

  if (overlay) {
    let overlayEl = el.querySelector('.loading-overlay');
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'loading-overlay';
      el.appendChild(overlayEl);
    }
    overlayEl.innerHTML = `
      <div class="loading-spinner large"></div>
      <span style="color: var(--text-muted); font-size: 0.875rem;">${message}</span>
    `;
    overlayEl.style.display = 'flex';
  } else {
    el.innerHTML = `
      <div class="loading-placeholder">
        <div class="loading-spinner large"></div>
        <span>${message}</span>
      </div>
    `;
  }
}

function hideLoading(container) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;
  const overlay = el.querySelector('.loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function updateLoadingProgress(container, message, current, total) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;

  const placeholder = el.querySelector('.loading-placeholder') || el.querySelector('.loading-overlay');
  if (!placeholder) return;

  const textEl = placeholder.querySelector('span');
  if (textEl) {
    if (current !== undefined && total !== undefined) {
      textEl.innerHTML = `${message}<div class="loading-progress">Page ${current} of ${total}</div>`;
    } else if (current !== undefined) {
      textEl.innerHTML = `${message}<div class="loading-progress">${current} items loaded...</div>`;
    } else {
      textEl.textContent = message;
    }
  }
}

async function paginateAll(toolName, baseArgs, options = {}) {
  const { maxPages = 10, limit = 100, onProgress } = options;
  let allItems = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page++) {
    const args = { ...baseArgs, limit };
    if (cursor) args.cursor = cursor;

    if (onProgress) onProgress(page + 1, maxPages, allItems.length);

    const result = await callTool(toolName, args);
    const data = parseToolResult(result);
    const items = data?.data?.data || [];

    if (items.length === 0) break;
    allItems = allItems.concat(items);

    const nextUrl = data?.data?.pagination?.nextUrl;
    if (!nextUrl) break;

    const urlParams = new URLSearchParams(nextUrl.split('?')[1] || '');
    cursor = urlParams.get('cursor');
    if (!cursor) break;
  }

  return allItems;
}

async function withLoading(container, asyncFn, options = {}) {
  const { message = 'Loading...', overlay = false } = options;
  showLoading(container, message, overlay);
  try {
    return await asyncFn();
  } catch (e) {
    showError(e.message);
    throw e;
  }
}

const breadcrumbState = {
  items: [],
  originalTitle: null,
  originalSubtitle: null
};

function initBreadcrumbs() {
  const titleEl = document.getElementById('dashboard-title');
  const subtitleEl = document.getElementById('dashboard-subtitle');
  breadcrumbState.originalTitle = titleEl?.textContent || 'Dashboard';
  breadcrumbState.originalSubtitle = subtitleEl?.textContent || '';
}

function setBreadcrumbs(items, newSubtitle) {
  const breadcrumbEl = document.getElementById('breadcrumb');
  const titleEl = document.getElementById('dashboard-title');
  const subtitleEl = document.getElementById('dashboard-subtitle');

  if (!breadcrumbEl) return;

  breadcrumbState.items = items;

  if (items.length === 0) {
    breadcrumbEl.innerHTML = '';
    if (titleEl) titleEl.textContent = breadcrumbState.originalTitle;
    if (subtitleEl) subtitleEl.textContent = breadcrumbState.originalSubtitle;
    return;
  }

  const html = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const separator = isLast ? '' : '<span class="breadcrumb-separator">\u203a</span>';

    if (isLast) {
      return `<span class="breadcrumb-item">
        <span class="breadcrumb-current">${item.label}</span>
      </span>`;
    } else {
      return `<span class="breadcrumb-item">
        <a class="breadcrumb-link" data-breadcrumb-index="${index}">${item.label}</a>
        ${separator}
      </span>`;
    }
  }).join('');

  breadcrumbEl.innerHTML = html;

  breadcrumbEl.querySelectorAll('.breadcrumb-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.breadcrumbIndex);
      const item = breadcrumbState.items[index];
      if (item?.onClick) item.onClick();
    });
  });

  if (titleEl && items.length > 0) {
    const current = items[items.length - 1];
    titleEl.textContent = `${breadcrumbState.originalTitle} \u203a ${current.label}`;
  }

  if (subtitleEl && newSubtitle !== undefined) {
    subtitleEl.textContent = newSubtitle;
  }
}

function clearBreadcrumbs() {
  setBreadcrumbs([]);
}

function pushBreadcrumb(label, onClick) {
  if (breadcrumbState.items.length > 0) {
    const lastItem = breadcrumbState.items[breadcrumbState.items.length - 1];
    if (!lastItem.onClick && lastItem._onClick) {
      lastItem.onClick = lastItem._onClick;
    }
  }
  breadcrumbState.items.push({ label, _onClick: onClick });
  setBreadcrumbs(breadcrumbState.items);
}

function popBreadcrumb() {
  if (breadcrumbState.items.length > 1) {
    breadcrumbState.items.pop();
    const lastItem = breadcrumbState.items[breadcrumbState.items.length - 1];
    if (lastItem?.onClick) lastItem.onClick();
  } else {
    clearBreadcrumbs();
  }
}

setTimeout(initBreadcrumbs, 0);

function parseToolResult(result) {
  if (result.structuredContent) return result.structuredContent;
  if (result.content?.[0]?.text) {
    try { return JSON.parse(result.content[0].text); } catch {}
  }
  return null;
}

new ResizeObserver(() => {
  const { body, documentElement: html } = document;
  const bodyStyle = getComputedStyle(body);
  const htmlStyle = getComputedStyle(html);
  const width = body.scrollWidth;
  const height =
    body.scrollHeight +
    (parseFloat(bodyStyle.borderTopWidth) || 0) +
    (parseFloat(bodyStyle.borderBottomWidth) || 0) +
    (parseFloat(htmlStyle.borderTopWidth) || 0) +
    (parseFloat(htmlStyle.borderBottomWidth) || 0);
  window.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/notifications/size-changed',
    params: { width, height }
  }, '*');
}).observe(document.body);

async function copyToClipboard(text, successMessage = '\u2713 Copied to clipboard', successSubtitle = '') {
  try {
    await navigator.clipboard.writeText(text);
    console.log('[Export] Copied to clipboard');
    showToast(successMessage, successSubtitle);
    return true;
  } catch (e) {
    console.error('[Export] Clipboard failed:', e);
    showToast('Copy failed: ' + e.message, '', 'error');
    return false;
  }
}

function toCSV(data, columns) {
  if (!data || data.length === 0) return '';

  if (!columns) {
    columns = Object.keys(data[0]).map(k => ({ key: k, label: k }));
  }

  const headers = columns.map(c => c.label || c.key);
  const rows = data.map(row => {
    return columns.map(c => {
      let val = row[c.key];
      if (val === null || val === undefined) val = '';
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function exportAsCSV(data, columns, name = 'data') {
  if (!data || data.length === 0) {
    showToast('No data to export', '', 'error');
    return;
  }

  const csv = toCSV(data, columns);
  copyToClipboard(
    csv,
    '\u2713 Copied ' + data.length + ' rows to clipboard',
    'Paste into Excel, Sheets, or any text editor'
  );
}

function showToast(message, subtitle = '', type = 'success') {
  const existing = document.getElementById('dashboard-toast');
  if (existing) existing.remove();

  const isError = type === 'error';
  const bgColor = isError ? '#dc2626' : 'var(--accent, #f97316)';

  const toast = document.createElement('div');
  toast.id = 'dashboard-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${bgColor};
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    z-index: 9999;
    max-width: 320px;
    animation: toastSlideIn 0.3s ease-out;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  toast.innerHTML = `
    <div style="font-weight: 600; font-size: 0.95rem;">${message}</div>
    ${subtitle ? `<div style="font-size: 0.8rem; opacity: 0.9; margin-top: 4px;">${subtitle}</div>` : ''}
  `;

  if (!document.getElementById('toast-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-styles';
    style.textContent = `
      @keyframes toastSlideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes toastSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
