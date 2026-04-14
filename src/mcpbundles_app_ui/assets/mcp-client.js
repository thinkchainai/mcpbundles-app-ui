var renderDashboard = function(data) {
  window.__QUEUED_DATA__ = data;
};

const state = {
  data: null,
  mcpInitialized: false,
  nextRequestId: 1,
  toolName: null,
  lastToolInput: null,
  displayMode: 'inline',
  availableDisplayModes: []
};
const pendingRequests = new Map();

function _tryParseJSON(text) {
  try { var p = JSON.parse(text); if (p && typeof p === 'object') return p; } catch(_) {}
  if (text.charAt(0) === '{') {
    var depth = 0, inStr = false, esc = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { try { var p2 = JSON.parse(text.substring(0, i + 1)); if (p2 && typeof p2 === 'object') return p2; } catch(_) {} break; } }
    }
  }
  return null;
}

function extractData(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.isError) return null;
  if (o.structuredContent && typeof o.structuredContent === 'object') return o.structuredContent;
  if (o.content && Array.isArray(o.content)) {
    for (var i = 0; i < o.content.length; i++) {
      if (o.content[i] && o.content[i].type === 'text' && typeof o.content[i].text === 'string') {
        var parsed = _tryParseJSON(o.content[i].text);
        if (parsed) return parsed;
      }
    }
  }
  if (o.result && typeof o.result === 'object') return extractData(o.result);
  return null;
}

function extractErrorText(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.content && Array.isArray(o.content)) {
    for (var i = 0; i < o.content.length; i++) {
      if (o.content[i] && o.content[i].type === 'text' && typeof o.content[i].text === 'string') {
        return o.content[i].text;
      }
    }
  }
  return null;
}

var _MCP_INIT_TIMEOUT = 10000;
var _MCP_INIT_RETRIES = 2;

function _sendInit() {
  var id = state.nextRequestId++;
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
  return id;
}

function _handleInitResult(result) {
  state.mcpInitialized = true;
  if (result.hostContext?.toolInfo?.tool?.name) {
    state.toolName = result.hostContext.toolInfo.tool.name;
  }
  if (result.hostContext?.displayMode) {
    state.displayMode = result.hostContext.displayMode;
  }
  if (result.hostContext?.availableDisplayModes) {
    state.availableDisplayModes = result.hostContext.availableDisplayModes;
  }
  window.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/notifications/initialized',
    params: {}
  }, '*');
  if (canGoFullscreen()) {
    _injectFullscreenButton();
  }
}

function initializeMCP() {
  var attempt = 0;

  function tryInit() {
    var id = _sendInit();
    pendingRequests.set(id, _handleInitResult);

    setTimeout(function() {
      if (state.mcpInitialized) return;
      pendingRequests.delete(id);
      attempt++;
      if (attempt < _MCP_INIT_RETRIES) {
        tryInit();
      } else {
        showContentError({
          title: 'Unable to connect',
          message: 'Could not reach the server after multiple attempts.',
          icon: 'warning',
          retry: function() { attempt = 0; tryInit(); },
          retryLabel: 'Retry connection'
        });
      }
    }, _MCP_INIT_TIMEOUT);
  }

  tryInit();
}

var _TOOL_CALL_TIMEOUT = 60000;
var _TOOL_CALL_MAX_RETRIES = 1;

var _ERROR_PATTERNS = [
  { pattern: /authenticat|unauthorized|auth required|not authenticated/i, title: 'Authentication required', retriable: false },
  { pattern: /not available.*bundle|not enabled/i, title: 'Tool not available', retriable: false },
  { pattern: /rate.?limit|too many requests|quota/i, title: 'Rate limit reached', retriable: false },
  { pattern: /timed?\s*out|deadline|took too long/i, title: 'Request timed out', icon: 'timeout', retriable: true },
  { pattern: /connect|network|ECONNREFUSED|ENOTFOUND|fetch failed/i, title: 'Connection error', retriable: true },
  { pattern: /internal.*error|500|server error/i, title: 'Server error', retriable: true },
];

function _classifyError(message) {
  for (var i = 0; i < _ERROR_PATTERNS.length; i++) {
    var p = _ERROR_PATTERNS[i];
    if (p.pattern.test(message)) {
      return { title: p.title, icon: p.icon || (p.retriable ? 'warning' : 'error'), retriable: p.retriable };
    }
  }
  return { title: 'Something went wrong', icon: 'error', retriable: true };
}

function _rawCallTool(name, args) {
  var id = state.nextRequestId++;
  return new Promise(function(resolve, reject) {
    pendingRequests.set(id, { resolve: resolve, reject: reject });
    window.parent.postMessage({
      jsonrpc: '2.0',
      id: id,
      method: 'tools/call',
      params: { name: name, arguments: args }
    }, '*');
    setTimeout(function() {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timed out \u2014 the server took too long to respond'));
      }
    }, _TOOL_CALL_TIMEOUT);
  });
}

async function callTool(name, args) {
  if (args === undefined) args = {};
  console.log('[MCP-DEBUG] callTool:', name, JSON.stringify(args));
  if (!state.mcpInitialized) {
    console.log('[MCP-DEBUG] callTool: NOT INITIALIZED');
    throw new Error('Not connected to server');
  }

  var lastError;
  for (var attempt = 0; attempt <= _TOOL_CALL_MAX_RETRIES; attempt++) {
    try {
      console.log('[MCP-DEBUG] callTool attempt=' + attempt);
      var result = await _rawCallTool(name, args);
      console.log('[MCP-DEBUG] callTool raw result: isError=' + (result && result.isError) + ' keys=' + (result && typeof result === 'object' ? Object.keys(result).join(',') : typeof result));
      if (result && result.isError) {
        var errMsg = extractErrorText(result) || 'Tool returned an error';
        console.log('[MCP-DEBUG] callTool isError=true, errMsg=' + errMsg);
        var info = _classifyError(errMsg);
        if (!info.retriable || attempt >= _TOOL_CALL_MAX_RETRIES) {
          var err = new Error(errMsg);
          err._classified = info;
          throw err;
        }
        lastError = errMsg;
      } else {
        console.log('[MCP-DEBUG] callTool SUCCESS, returning result');
        return result;
      }
    } catch (e) {
      console.log('[MCP-DEBUG] callTool CATCH:', e.message);
      var classified = e._classified || _classifyError(e.message);
      if (!classified.retriable || attempt >= _TOOL_CALL_MAX_RETRIES) {
        if (!e._classified) e._classified = classified;
        throw e;
      }
      lastError = e.message;
    }
    await new Promise(function(r) { setTimeout(r, 1000 * (attempt + 1)); });
  }
  throw new Error(lastError || 'Request failed after retries');
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
    pendingRequests.set(id, { resolve: resolve, reject: reject });
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Message timeout'));
      }
    }, 30000);
  });
}

async function requestDisplayMode(mode) {
  if (!state.mcpInitialized) return;
  if (!state.availableDisplayModes.includes(mode)) return;
  if (state.displayMode === mode) return;
  var id = state.nextRequestId++;
  return new Promise(function(resolve, reject) {
    pendingRequests.set(id, function(result) {
      if (result && result.mode) state.displayMode = result.mode;
      resolve(result);
    });
    window.parent.postMessage({
      jsonrpc: '2.0',
      id: id,
      method: 'ui/requestDisplayMode',
      params: { mode: mode }
    }, '*');
    setTimeout(function() {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve({ mode: state.displayMode });
      }
    }, 5000);
  });
}

function canGoFullscreen() {
  return state.availableDisplayModes.includes('fullscreen') && state.displayMode !== 'fullscreen';
}

function _injectFullscreenButton() {
  if (document.getElementById('mcpFullscreenBtn')) return;
  var container = document.querySelector('.te-tab-actions');
  if (!container) return;
  var btn = document.createElement('button');
  btn.id = 'mcpFullscreenBtn';
  btn.className = 'te-action-btn';
  btn.title = 'Expand to panel';
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  btn.addEventListener('click', function() { requestDisplayMode('fullscreen'); });
  container.appendChild(btn);
}

function updateModelContext(text) {
  if (!state.mcpInitialized) return;
  window.parent.postMessage({
    jsonrpc: '2.0',
    method: 'ui/update-model-context',
    params: {
      content: [{ type: 'text', text: text }]
    }
  }, '*');
}

async function askAI(question) {
  try {
    await sendMessage(question, 'user');
  } catch (e) {
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
  if (getAskAIContext) btns += `<button class="section-btn" data-action="askAI" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Ask AI</button>`;

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
          const { question } = handler();
          await askAI(question);
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
  ai: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
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
    label: 'Ask AI',
    icon: 'ai',
    onClick: async () => {
      const { question } = getContext();
      await askAI(question);
    },
    primary: false
  });

  setHeaderActions(actions);
}

function addFloatingAskAIButton(getContext) {
  addViewActions(getContext);
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.jsonrpc !== '2.0') return;

  if (msg.id && pendingRequests.has(msg.id)) {
    const entry = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    console.log('[MCP-DEBUG] postMessage response id=' + msg.id, 'hasResult=' + (msg.result !== undefined), 'hasError=' + !!msg.error, 'entryType=' + (typeof entry === 'function' ? 'fn' : 'resolve/reject'));
    if (msg.result !== undefined) {
      console.log('[MCP-DEBUG] result keys=' + (msg.result && typeof msg.result === 'object' ? Object.keys(msg.result).join(',') : typeof msg.result), 'isError=' + (msg.result && msg.result.isError));
      if (typeof entry === 'function') entry(msg.result);
      else if (entry.resolve) entry.resolve(msg.result);
    } else if (msg.error) {
      var errMsg = msg.error.message || 'Request failed';
      console.log('[MCP-DEBUG] JSONRPC error:', errMsg);
      if (entry.reject) entry.reject(new Error(errMsg));
      else showError(errMsg);
    }
    return;
  }

  if (msg.method === 'ui/notifications/host-context-changed') {
    if (msg.params?.displayMode) state.displayMode = msg.params.displayMode;
    if (msg.params?.availableDisplayModes) state.availableDisplayModes = msg.params.availableDisplayModes;
  }

  if (msg.method === 'ui/notifications/tool-input') {
    state.lastToolInput = (msg.params && msg.params.arguments) || (msg.params && msg.params.input) || msg.params || null;
    if (msg.params && msg.params.toolName) state.toolName = msg.params.toolName;
  }

  if (msg.method === 'ui/notifications/tool-result') {
    var isError = msg.params && msg.params.isError;
    if (isError) {
      var errText = '';
      if (msg.params.content && Array.isArray(msg.params.content)) {
        for (var ci = 0; ci < msg.params.content.length; ci++) {
          if (msg.params.content[ci] && msg.params.content[ci].type === 'text') {
            errText = msg.params.content[ci].text;
            break;
          }
        }
      }
      showContentError({
        title: 'Tool returned an error',
        message: errText || 'The server returned an error response.',
        icon: 'error',
        retry: function() { location.reload(); }
      });
      return;
    }
    const data = extractData(msg.params);
    if (data) {
      if (typeof window.__checkGate === 'function' && window.__checkGate(data)) return;
      if (msg.params._forwardedFrom) data._forwardedFrom = msg.params._forwardedFrom;
      state.data = data;
      renderDashboard(data);
    }
  }
});

var _ERROR_ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  timeout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
};

function _escText(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function showError(message) {
  var banner = document.getElementById('error-banner');
  var msgEl = document.getElementById('error-message');
  if (banner && msgEl) {
    msgEl.textContent = message;
    banner.classList.add('visible');
    setTimeout(function() { banner.classList.remove('visible'); }, 6000);
  }
}

function showContentError(opts) {
  var title = opts.title || 'Something went wrong';
  var message = opts.message || '';
  var icon = opts.icon || 'error';
  var retry = opts.retry || null;
  var retryLabel = opts.retryLabel || 'Try again';
  var target = opts.target || null;

  var container = target
    ? (typeof target === 'string' ? document.querySelector(target) : target)
    : document.querySelector('.dashboard-content') || document.querySelector('main');
  if (!container) return;

  var iconClass = icon === 'warning' ? ' warning' : icon === 'info' ? ' info' : '';
  var iconSvg = _ERROR_ICONS[icon] || _ERROR_ICONS.error;

  var actionsHtml = '';
  if (retry) {
    actionsHtml = '<div class="app-error-actions">' +
      '<button class="app-error-btn primary" id="app-error-retry">' + _escText(retryLabel) + '</button>' +
      '</div>';
  }

  container.innerHTML =
    '<div class="app-error-state">' +
      '<div class="app-error-icon' + iconClass + '">' + iconSvg + '</div>' +
      '<div class="app-error-title">' + _escText(title) + '</div>' +
      (message ? '<div class="app-error-message">' + _escText(message) + '</div>' : '') +
      actionsHtml +
    '</div>';

  if (retry) {
    var btn = document.getElementById('app-error-retry');
    if (btn) {
      btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg> ' + _escText(retryLabel);
        retry();
      });
    }
  }
}

function showLoading(container, message = 'Loading...', overlay = false) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;

  const skeletonHtml = `
    <div class="loading-placeholder">
      <div style="width:100%;display:flex;flex-direction:column;gap:10px;padding:0 4px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="skeleton-block" style="height:56px;border-radius:8px;"></div>
          <div class="skeleton-block" style="height:56px;border-radius:8px;"></div>
        </div>
        <div class="skeleton-block" style="height:14px;border-radius:4px;width:100%;"></div>
        <div class="skeleton-block" style="height:14px;border-radius:4px;width:65%;"></div>
        <div class="skeleton-block" style="height:14px;border-radius:4px;width:40%;"></div>
      </div>
      <span style="color:var(--text-muted);font-size:0.875rem;">${message}</span>
    </div>
  `;

  if (overlay) {
    let overlayEl = el.querySelector('.loading-overlay');
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'loading-overlay';
      el.appendChild(overlayEl);
    }
    overlayEl.innerHTML = skeletonHtml;
    overlayEl.style.display = 'flex';
  } else {
    el.innerHTML = skeletonHtml;
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
    const items = data?.data || [];

    if (items.length === 0) break;
    allItems = allItems.concat(items);

    const nextUrl = data?.pagination?.nextUrl;
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
  return extractData(result);
}

var _lastW = 0, _lastH = 0;
new ResizeObserver((entries) => {
  const entry = entries[0];
  if (!entry) return;
  const { body, documentElement: html } = document;
  const bodyStyle = getComputedStyle(body);
  const htmlStyle = getComputedStyle(html);
  const width = Math.ceil(body.scrollWidth);
  const height = Math.ceil(
    body.scrollHeight +
    (parseFloat(bodyStyle.borderTopWidth) || 0) +
    (parseFloat(bodyStyle.borderBottomWidth) || 0) +
    (parseFloat(htmlStyle.borderTopWidth) || 0) +
    (parseFloat(htmlStyle.borderBottomWidth) || 0));
  if (width === _lastW && height === _lastH) return;
  _lastW = width; _lastH = height;
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
