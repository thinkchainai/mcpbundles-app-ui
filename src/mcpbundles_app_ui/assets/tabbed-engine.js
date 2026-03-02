/**
 * Tabbed Dashboard Engine — config-driven tabs with declarative section views.
 * Config-driven via window.__APP_CONFIG__.
 *
 * Config shape:
 *   tabs:             [{id, label, tool, type?, sections?, form?, emptyState?,
 *                       hasPeriod, needsArgs, defaultArgs, dataDetect,
 *                       promptTitle, promptHint, searchPlaceholder, titleKey}]
 *   toolCatalog:      [{name, label, icon, desc, usage, source, stateful}]
 *   toolCatalogIntro: string (HTML)
 *   periods:          ["1y","2y","5y",...]
 *   defaultPeriod:    "5y"
 *   footerText:       "FRED · BLS · ..."
 *   colors:           ["#3b82f6",...]
 *   toolName:         "open_economic_app"
 *
 * Section types (declarative, config-driven):
 *   stats, label, list, scored-list, bands, form, banner, text, meta,
 *   alerts, timestamp, gauge, card-grid, empty-state, explanations
 *
 * Expects globals from mcp-client.js:
 *   state, callTool, extractData, sendMessage, addViewActions, clearHeaderActions, showError
 */
(function() {
'use strict';

var cfg = window.__APP_CONFIG__ || {};
if (!cfg.tabs || !cfg.tabs.length) return;

var TABS = cfg.tabs;
var TOOL_CATALOG = cfg.toolCatalog || [];
var PERIODS = cfg.periods || ['1y','2y','5y','10y','20y'];
var DEF_PERIOD = cfg.defaultPeriod || '5y';
var FOOTER = cfg.footerText || '';
var COLORS = cfg.colors || ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#a855f7'];

var TAB_MAP = {};
var TOOL_TO_TAB = {};
for (var i = 0; i < TABS.length; i++) {
  TAB_MAP[TABS[i].id] = TABS[i];
  if (TABS[i].tool) TOOL_TO_TAB[TABS[i].tool] = TABS[i].id;
}

var eS = { activeTab: null, tabData: {}, tabPeriod: {}, hiddenSeries: {} };

function esc(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function escAttr(t) { return (t||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtVal(v) {
  var abs = Math.abs(v);
  if (abs >= 1e12) return (v/1e12).toFixed(1)+'T';
  if (abs >= 1e9) return (v/1e9).toFixed(1)+'B';
  if (abs >= 1e6) return (v/1e6).toFixed(1)+'M';
  if (abs >= 1e4) return (v/1e3).toFixed(0)+'K';
  if (v === Math.floor(v)) return v.toString();
  return v.toFixed(2);
}

function resolveKey(obj, key) {
  if (!key || !obj) return undefined;
  var parts = key.split('.');
  var val = obj;
  for (var i = 0; i < parts.length; i++) {
    if (val === null || val === undefined) return undefined;
    val = val[parts[i]];
  }
  return val;
}

function formatValue(v, fmt) {
  if (v === null || v === undefined) return '\u2014';
  if (fmt === 'number' && typeof v === 'number') return v.toLocaleString();
  if (fmt === 'percent' && typeof v === 'number') return (v * 100).toFixed(2) + '%';
  if (fmt === 'percent-round' && typeof v === 'number') return Math.round(v * 100) + '%';
  if (fmt === 'score' && typeof v === 'number') return v.toFixed(1);
  if (fmt === 'date-short' && typeof v === 'string') { try { return new Date(v).toLocaleDateString('en', {month:'short',day:'numeric'}); } catch(e){} }
  if (fmt === 'date' && typeof v === 'string') return v.substring(0, 10);
  if (fmt === 'join' && Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ======================================================================
// Canvas multi-series line chart
// ======================================================================
function drawChart(containerId, series, hiddenMap) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  var visible = [];
  for (var i = 0; i < series.length; i++) { if (!hiddenMap[i]) visible.push({ idx: i, s: series[i] }); }

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  var dpr = window.devicePixelRatio || 1;
  var rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;

  var hasY1 = series.length > 1 && series[1].units !== series[0].units;
  var pad = { t: 14, r: hasY1 ? 58 : 18, b: 34, l: 54 };
  var pW = W - pad.l - pad.r, pH = H - pad.t - pad.b;
  if (pW < 40 || pH < 40) return;

  var allTs = [], yB = [{ mn: Infinity, mx: -Infinity }, { mn: Infinity, mx: -Infinity }];
  for (var vi = 0; vi < visible.length; vi++) {
    var s = visible[vi].s, ax = (visible[vi].idx > 0 && hasY1) ? 1 : 0;
    s._pts = [];
    for (var di = 0; di < (s.data||[]).length; di++) {
      var ts = new Date(s.data[di].date).getTime(), v = s.data[di].value;
      s._pts.push({ t: ts, v: v });
      allTs.push(ts);
      if (v < yB[ax].mn) yB[ax].mn = v;
      if (v > yB[ax].mx) yB[ax].mx = v;
    }
    s._pts.sort(function(a, b) { return a.t - b.t; });
  }
  if (!allTs.length) { container.innerHTML = '<div class="te-loading"><span>No data to chart</span></div>'; return; }

  var xMn = Math.min.apply(null, allTs), xMx = Math.max.apply(null, allTs);
  if (xMn === xMx) xMx = xMn + 86400000;
  for (var a = 0; a < 2; a++) { var rng = yB[a].mx - yB[a].mn; if (rng === 0) rng = 1; yB[a].mn -= rng * 0.05; yB[a].mx += rng * 0.05; }

  function xS(t) { return pad.l + (t - xMn) / (xMx - xMn) * pW; }
  function yS(v, ax) { return pad.t + pH - (v - yB[ax].mn) / (yB[ax].mx - yB[ax].mn) * pH; }

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (var g = 0; g <= 4; g++) { var gy = pad.t + (pH/4)*g; ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(pad.l+pW, gy); ctx.stroke(); }

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '10px -apple-system,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (var g = 0; g <= 4; g++) { var val = yB[0].mx - (yB[0].mx - yB[0].mn) * (g/4); ctx.fillText(fmtVal(val), pad.l-6, pad.t+(pH/4)*g); }
  if (hasY1) { ctx.textAlign = 'left'; for (var g = 0; g <= 4; g++) { var val = yB[1].mx - (yB[1].mx - yB[1].mn) * (g/4); ctx.fillText(fmtVal(val), pad.l+pW+6, pad.t+(pH/4)*g); } }

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  var nL = Math.min(6, Math.floor(pW/72));
  for (var g = 0; g <= nL; g++) {
    var t = xMn + (xMx - xMn) * (g/nL);
    ctx.fillText(new Date(t).toLocaleDateString('en', { month: 'short', year: '2-digit' }), xS(t), H - pad.b + 8);
  }

  for (var vi = 0; vi < visible.length; vi++) {
    var s = visible[vi].s, pts = s._pts, ax = (visible[vi].idx > 0 && hasY1) ? 1 : 0;
    var col = COLORS[visible[vi].idx % COLORS.length];
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var p = 0; p < pts.length; p++) { var x = xS(pts[p].t), y = yS(pts[p].v, ax); if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    if (visible.length === 1 && pts.length > 1) {
      ctx.lineTo(xS(pts[pts.length-1].t), pad.t+pH); ctx.lineTo(xS(pts[0].t), pad.t+pH); ctx.closePath();
      ctx.fillStyle = col + '18'; ctx.fill();
    }
  }

  var tt = document.createElement('div'); tt.className = 'te-chart-tooltip';
  container.appendChild(tt);
  var crossCanvas = document.createElement('canvas');
  crossCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  crossCanvas.width = canvas.width; crossCanvas.height = canvas.height;
  container.appendChild(crossCanvas);
  var crossCtx = crossCanvas.getContext('2d'); crossCtx.scale(dpr, dpr);

  canvas.addEventListener('mousemove', function(ev) {
    var cr = canvas.getBoundingClientRect();
    var mx = ev.clientX - cr.left, my = ev.clientY - cr.top;
    crossCtx.clearRect(0, 0, W, H);
    if (mx < pad.l || mx > pad.l+pW || my < pad.t || my > pad.t+pH) { tt.style.display = 'none'; return; }
    crossCtx.strokeStyle = 'rgba(255,255,255,0.15)'; crossCtx.lineWidth = 1; crossCtx.setLineDash([4, 3]);
    crossCtx.beginPath(); crossCtx.moveTo(mx, pad.t); crossCtx.lineTo(mx, pad.t+pH); crossCtx.stroke();
    crossCtx.setLineDash([]);
    var hoverT = xMn + (mx - pad.l) / pW * (xMx - xMn);
    var lines = [], closestDate = null;
    for (var vi = 0; vi < visible.length; vi++) {
      var pts = visible[vi].s._pts, col = COLORS[visible[vi].idx % COLORS.length];
      var best = 0, bestD = Infinity;
      for (var p = 0; p < pts.length; p++) { var dist = Math.abs(pts[p].t - hoverT); if (dist < bestD) { bestD = dist; best = p; } }
      if (pts[best]) {
        if (!closestDate) closestDate = new Date(pts[best].t);
        lines.push('<span style="color:' + col + '">\u25CF</span> ' + esc(visible[vi].s.title || visible[vi].s.series_id) + ': <b>' + pts[best].v.toLocaleString() + '</b>');
        var dotX = xS(pts[best].t), dotY = yS(pts[best].v, (visible[vi].idx > 0 && hasY1) ? 1 : 0);
        crossCtx.fillStyle = col; crossCtx.beginPath(); crossCtx.arc(dotX, dotY, 4, 0, Math.PI*2); crossCtx.fill();
      }
    }
    if (lines.length) {
      var ds = closestDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
      tt.innerHTML = '<div class="te-tt-date">' + ds + '</div>' + lines.join('<br>');
      tt.style.display = 'block';
      tt.style.left = Math.min(mx + 14, W - tt.offsetWidth - 4) + 'px';
      tt.style.top = Math.max(my - tt.offsetHeight / 2, 2) + 'px';
    }
  });
  canvas.addEventListener('mouseleave', function() { tt.style.display = 'none'; crossCtx.clearRect(0, 0, W, H); });
}

// ======================================================================
// DOM Setup
// ======================================================================
function buildUI() {
  var root = document.querySelector('.dashboard-content');
  root.innerHTML = '';

  var tabBar = document.createElement('div');
  tabBar.className = 'te-tab-bar';
  tabBar.id = 'teTabBar';
  root.appendChild(tabBar);

  var toolbar = document.createElement('div');
  toolbar.className = 'te-toolbar hidden';
  toolbar.id = 'teToolbar';
  for (var i = 0; i < PERIODS.length; i++) {
    var btn = document.createElement('button');
    btn.className = 'te-period-btn' + (PERIODS[i] === DEF_PERIOD ? ' active' : '');
    btn.dataset.period = PERIODS[i];
    btn.textContent = PERIODS[i].toUpperCase();
    toolbar.appendChild(btn);
  }
  root.appendChild(toolbar);

  var content = document.createElement('div');
  content.className = 'te-content';
  content.id = 'teContent';
  root.appendChild(content);

  if (FOOTER) {
    var footer = document.createElement('div');
    footer.className = 'te-footer';
    footer.innerHTML = '<span>' + esc(FOOTER) + '</span><a href="https://mcpbundles.com" target="_blank">mcpbundles.com \u2197</a>';
    root.appendChild(footer);
  }

  buildTabs();
  wireToolbar();

  content.addEventListener('click', function(e) {
    var el = e.target.closest('[data-navigate-tab]');
    if (el) {
      var targetTab = el.dataset.navigateTab;
      var value = el.dataset.navigateValue;
      if (targetTab && value) navigateToTab(targetTab, value);
    }
    var msgEl = e.target.closest('[data-send-message]');
    if (msgEl) {
      sendMessage(msgEl.dataset.sendMessage).catch(function(){});
    }
  });
}

// ======================================================================
// Cross-tab Navigation
// ======================================================================
function navigateToTab(targetTabId, value) {
  var tab = TAB_MAP[targetTabId];
  if (!tab) return;

  eS.activeTab = targetTabId;
  activateTabUI(targetTabId);
  document.getElementById('teToolbar').className = tab.hasPeriod ? 'te-toolbar' : 'te-toolbar hidden';

  if (tab.form) {
    document.getElementById('dashboard-title').textContent = tab.label + ': ' + value;
    var c = document.getElementById('teContent');
    c.innerHTML = renderFormHtml(tab.form, value) +
      '<div id="teSectionResult"><div class="te-loading"><div class="te-spinner"></div><span>Loading\u2026</span></div></div>';
    wireGenericForm(tab);
    updateHeaderActions(targetTabId);

    var args = {};
    args[tab.form.queryParam] = value;
    callTool(tab.tool, args).then(function(res) {
      var d = extractData(res);
      if (d) {
        eS.tabData[targetTabId] = d;
        renderSectionResult(tab, d);
      }
    }).catch(function(e) { showError(e.message); });
    return;
  }

  switchTab(targetTabId);
}

// ======================================================================
// Tabs
// ======================================================================
function buildTabs() {
  var bar = document.getElementById('teTabBar');
  for (var i = 0; i < TABS.length; i++) {
    var el = document.createElement('div'); el.className = 'te-tab'; el.dataset.tab = TABS[i].id;
    el.textContent = TABS[i].label;
    el.addEventListener('click', (function(tid) { return function() { switchTab(tid); }; })(TABS[i].id));
    bar.appendChild(el);
  }
}

function activateTabUI(tid) { var all = document.querySelectorAll('.te-tab'); for (var i = 0; i < all.length; i++) all[i].classList.toggle('active', all[i].dataset.tab === tid); }
function setPeriodUI(p) { var b = document.querySelectorAll('.te-period-btn'); for (var i = 0; i < b.length; i++) b[i].classList.toggle('active', b[i].dataset.period === p); }

function switchTab(tabId) {
  if (eS.activeTab === tabId) return;
  eS.activeTab = tabId; eS.hiddenSeries = {};
  activateTabUI(tabId);
  var tab = TAB_MAP[tabId];
  document.getElementById('teToolbar').className = tab.hasPeriod ? 'te-toolbar' : 'te-toolbar hidden';
  if (tab.hasPeriod) setPeriodUI(eS.tabPeriod[tabId] || DEF_PERIOD);
  document.getElementById('dashboard-title').textContent = tab.label;

  if (tab.type === 'tools') { renderToolsView(); updateHeaderActions(tabId); return; }
  if (eS.tabData[tabId]) { renderTabContent(tabId, eS.tabData[tabId]); updateHeaderActions(tabId); return; }

  if (tab.needsArgs) {
    if (tab.form) {
      renderFormTab(tab);
    } else if (tab.type === 'search') {
      renderSearchForm(tab);
    } else {
      renderPromptView(tab.promptTitle || 'This view requires specific inputs', tab.promptHint || 'Ask your AI to call the appropriate tool');
    }
    updateHeaderActions(tabId);
    return;
  }

  teShowLoading('Loading ' + tab.label.toLowerCase() + '...');
  var args = {};
  if (tab.hasPeriod) args.period = eS.tabPeriod[tabId] || DEF_PERIOD;
  if (tab.defaultArgs) { for (var k in tab.defaultArgs) args[k] = tab.defaultArgs[k]; }
  callTool(tab.tool, args).then(function(result) {
    if (eS.activeTab !== tabId) return;
    var data = extractData(result);
    if (data) { eS.tabData[tabId] = data; renderTabContent(tabId, data); } else teShowLoading('No data available');
  }).catch(function(err) { if (eS.activeTab === tabId) showError(err.message); });
  updateHeaderActions(tabId);
}

function matchesTabData(tab, data) {
  var dd = tab.dataDetect;
  if (!dd) return false;
  if (dd.hasKey) return data[dd.hasKey] !== undefined;
  if (dd.anyKey) {
    for (var k = 0; k < dd.anyKey.length; k++) { if (data[dd.anyKey[k]] !== undefined) return true; }
    return false;
  }
  if (dd.allKeys) {
    for (var k = 0; k < dd.allKeys.length; k++) { if (data[dd.allKeys[k]] === undefined) return false; }
    return true;
  }
  return false;
}

function onInitialData(data) {
  buildUI();
  var tabId = state.toolName ? TOOL_TO_TAB[state.toolName] : null;
  if (!tabId) {
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      if (matchesTabData(t, data)) { tabId = t.id; break; }
      if (t.type === 'chart' && data.series) { tabId = t.id; break; }
      if (t.type === 'search' && data.query) { tabId = t.id; break; }
    }
    if (!tabId) tabId = TABS[0].id;
  }

  if (state.lastToolInput && state.lastToolInput.period) eS.tabPeriod[tabId] = state.lastToolInput.period;
  else if (data.period) eS.tabPeriod[tabId] = data.period;
  eS.tabData[tabId] = data; eS.activeTab = tabId; eS.hiddenSeries = {};
  activateTabUI(tabId);
  var tab = TAB_MAP[tabId];
  document.getElementById('teToolbar').className = tab.hasPeriod ? 'te-toolbar' : 'te-toolbar hidden';
  if (tab.hasPeriod) setPeriodUI(eS.tabPeriod[tabId] || DEF_PERIOD);
  renderTabContent(tabId, data);
  updateHeaderActions(tabId);
}

function renderTabContent(tabId, data) {
  var tab = TAB_MAP[tabId];
  if (tab.sections) { renderSections(tabId, data); return; }
  var custom = window.__CUSTOM_TAB_RENDERERS__;
  if (custom && custom[tab.type]) { custom[tab.type](data, tabId); return; }
  if (tab.type === 'chart') renderChartView(data);
  else if (tab.type === 'search') renderSearchResults(data);
}

function updateHeaderActions(tabId) {
  var data = eS.tabData[tabId];
  var tab = TAB_MAP[tabId];
  if (tab.type === 'tools' || !data) { clearHeaderActions(); return; }
  addViewActions(
    function() {
      var ctx = (data.title || tab.label) + '\n' + (data.summary || '');
      return { question: 'Analyze this data. Key takeaways?', context: ctx };
    },
    function() { return refreshCurrentTab(); }
  );
}

function teShowLoading(t) { document.getElementById('teContent').innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>' + esc(t) + '</span></div>'; }
function renderPromptView(title, hint) { document.getElementById('teContent').innerHTML = '<div class="te-prompt"><span class="te-prompt-text">' + esc(title) + '</span><span class="te-prompt-hint">' + esc(hint) + '</span></div>'; }

// ======================================================================
// Chart View (generic — renders data.series)
// ======================================================================
function renderChartView(data) {
  var c = document.getElementById('teContent');
  c.innerHTML = '<div class="te-chart-wrap" id="teChartArea"></div><div class="te-legend" id="teLeg"></div><div class="te-summary" id="teSum"></div>';
  if (data.title) document.getElementById('dashboard-title').textContent = data.title;
  if (data.summary) document.getElementById('teSum').textContent = data.summary;
  var series = data.series || [];
  if (!series.length) { c.innerHTML = '<div class="te-loading"><span>No chart data available</span></div>'; return; }
  eS.hiddenSeries = {};
  drawChart('teChartArea', series, eS.hiddenSeries);
  var leg = document.getElementById('teLeg');
  series.forEach(function(s, i) {
    var el = document.createElement('div'); el.className = 'te-legend-item';
    el.innerHTML = '<span class="te-legend-dot" style="background:' + COLORS[i % COLORS.length] + '"></span>' + esc(s.title || s.series_id);
    el.onclick = function() { eS.hiddenSeries[i] = !eS.hiddenSeries[i]; el.classList.toggle('hidden', !!eS.hiddenSeries[i]); drawChart('teChartArea', series, eS.hiddenSeries); };
    leg.appendChild(el);
  });
}

// ======================================================================
// Search (generic — form + results)
// ======================================================================
function renderSearchForm(tab) {
  document.getElementById('dashboard-title').textContent = 'Search';
  var placeholder = (tab && tab.searchPlaceholder) || 'Search...';
  document.getElementById('teContent').innerHTML = '<div class="te-search-form"><input class="te-search-input" id="teSi" type="text" placeholder="' + escAttr(placeholder) + '" /><button class="te-search-btn" id="teSb">Search</button></div><div id="teSr"></div>';
  wireSearch(); document.getElementById('teSi').focus();
}

function renderSearchResults(data) {
  document.getElementById('dashboard-title').textContent = data.query ? 'Search: ' + data.query : 'Search';
  var searchTab = null;
  for (var i = 0; i < TABS.length; i++) { if (TABS[i].type === 'search') { searchTab = TABS[i]; break; } }
  var placeholder = (searchTab && searchTab.searchPlaceholder) || 'Search...';
  document.getElementById('teContent').innerHTML = '<div class="te-search-form"><input class="te-search-input" id="teSi" type="text" value="' + escAttr(data.query||'') + '" placeholder="' + escAttr(placeholder) + '" /><button class="te-search-btn" id="teSb">Search</button></div><div id="teSr"></div>';
  showSearchItems(data); wireSearch();
}

function wireSearch() {
  var inp = document.getElementById('teSi'), btn = document.getElementById('teSb');
  var searchTab = null;
  for (var i = 0; i < TABS.length; i++) { if (TABS[i].type === 'search') { searchTab = TABS[i]; break; } }
  if (!searchTab) return;
  function go() { var q = inp.value.trim(); if(!q)return; btn.disabled=true; btn.textContent='Searching...';
    var args = {};
    var queryParam = searchTab.searchQueryParam || 'query';
    var limitParam = searchTab.searchLimitParam || 'limit';
    args[queryParam] = q; args[limitParam] = 20;
    callTool(searchTab.tool,args).then(function(res){var d=extractData(res);if(d){eS.tabData[searchTab.id]=d;showSearchItems(d);document.getElementById('dashboard-title').textContent='Search: '+q;}}).catch(function(e){showError(e.message);}).finally(function(){btn.disabled=false;btn.textContent='Search';}); }
  btn.addEventListener('click', go); inp.addEventListener('keydown', function(e){if(e.key==='Enter')go();});
}

function showSearchItems(data) {
  var results = data.results || [], el = document.getElementById('teSr');
  if (!results.length) { el.innerHTML = '<div class="te-prompt"><span class="te-prompt-text">No results</span></div>'; return; }
  var html = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var meta = [r.units, r.seasonal_adjustment].filter(Boolean).join(' \u00B7 ');
    var idStr = r.id || r.series_id || '';
    var idHtml = idStr ? '<span class="te-search-item-id">' + esc(idStr) + '</span>' : '';
    html += '<div class="te-search-item"><div class="te-search-item-title">' + esc(r.title||r.name||'') + idHtml + '</div>' + (meta ? '<div class="te-search-item-meta">' + esc(meta) + '</div>' : '') + '</div>';
  }
  el.innerHTML = html;
}

// ======================================================================
// Tools Reference (generic)
// ======================================================================
function renderToolsView() {
  document.getElementById('dashboard-title').textContent = 'Available Tools';
  var c = document.getElementById('teContent');

  var html = '';
  if (cfg.toolCatalogIntro) {
    html = '<div class="te-tools-intro">' + cfg.toolCatalogIntro + '</div>';
  } else {
    html = '<div class="te-tools-intro">This server provides <strong>' + TOOL_CATALOG.length + ' tools</strong> your AI can call directly.</div>';
  }

  for (var i = 0; i < TOOL_CATALOG.length; i++) {
    var t = TOOL_CATALOG[i];
    var isApp = t.name === (cfg.toolName || '');
    var isStateful = t.stateful;
    var badgeClass = isApp ? ' interactive' : isStateful ? ' stateful' : '';
    var badgeLabel = isApp ? 'interactive' : isStateful ? 'stateful' : 'read-only';
    html += '<div class="te-tool-card"><div class="te-tool-card-head">' +
      '<span class="te-tool-card-icon">' + (t.icon || '') + '</span>' +
      '<span class="te-tool-card-name">' + esc(t.label) + '</span>' +
      '<span class="te-tool-card-badge' + badgeClass + '">' + badgeLabel + '</span>' +
      '</div>' +
      '<div class="te-tool-card-desc">' + esc(t.desc) + '</div>' +
      '<div class="te-tool-card-row">' +
      '<span><span class="label">Usage: </span><code>' + esc(t.usage) + '</code></span>' +
      '</div>' +
      '<div class="te-tool-card-row">' +
      '<span><span class="label">Source: </span><span class="source">' + esc(t.source) + '</span></span>' +
      '</div></div>';
  }
  c.innerHTML = html;
}

// ======================================================================
// Generic Form Tab (form + empty state, then form + sections on submit)
// ======================================================================
function renderFormHtml(form, prefill) {
  var val = prefill ? escAttr(String(prefill)) : '';
  if (form.inputType === 'textarea') {
    return '<div class="te-triage-form"><textarea class="te-triage-input" id="teFormInput" placeholder="' + escAttr(form.placeholder || '') + '" rows="3">' + esc(val) + '</textarea>' +
      '<button class="te-search-btn" id="teFormBtn">' + esc(form.buttonText || 'Submit') + '</button></div>';
  }
  return '<div class="te-search-form"><input class="te-search-input" id="teFormInput" type="text" value="' + val + '" placeholder="' + escAttr(form.placeholder || '') + '" />' +
    '<button class="te-search-btn" id="teFormBtn">' + esc(form.buttonText || 'Submit') + '</button></div>';
}

function renderFormTab(tab) {
  var c = document.getElementById('teContent');
  var emptyHtml = tab.emptyState
    ? '<div class="te-prompt"><span class="te-prompt-text">' + esc(tab.emptyState.title || '') + '</span>' +
      (tab.emptyState.hint ? '<span class="te-prompt-hint">' + esc(tab.emptyState.hint) + '</span>' : '') + '</div>'
    : '';
  c.innerHTML = renderFormHtml(tab.form) + '<div id="teSectionResult">' + emptyHtml + '</div>';
  wireGenericForm(tab);
  var inp = document.getElementById('teFormInput');
  if (inp) inp.focus();
}

function renderSectionResult(tab, data) {
  var resultEl = document.getElementById('teSectionResult');
  if (!resultEl) return;
  var html = renderSectionsHtml(data, tab.sections || []);
  resultEl.innerHTML = html;
  if (tab.titleKey) {
    var tv = resolveKey(data, tab.titleKey);
    if (tv) document.getElementById('dashboard-title').textContent = tab.label + ': ' + tv;
  }
}

function wireGenericForm(tab) {
  var inp = document.getElementById('teFormInput');
  var btn = document.getElementById('teFormBtn');
  if (!inp || !btn) return;
  var form = tab.form;
  function go() {
    var q = inp.value.trim();
    if (form.transform === 'uppercase') q = q.toUpperCase();
    if (!q) return;
    btn.disabled = true;
    var loadText = (form.loadingText || form.buttonText || 'Loading') + '\u2026';
    btn.textContent = loadText;
    var resultEl = document.getElementById('teSectionResult');
    if (resultEl) resultEl.innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>' + esc(loadText) + '</span></div>';
    var args = {};
    args[form.queryParam] = q;
    callTool(tab.tool, args).then(function(res) {
      var d = extractData(res);
      if (d) { eS.tabData[tab.id] = d; renderSectionResult(tab, d); }
    }).catch(function(e) { showError(e.message); })
    .finally(function() { btn.disabled = false; btn.textContent = form.buttonText || 'Submit'; });
  }
  btn.addEventListener('click', go);
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') go(); });
}

// ======================================================================
// Declarative Section Renderer
// ======================================================================
function renderSections(tabId, data) {
  var tab = TAB_MAP[tabId];
  var c = document.getElementById('teContent');
  if (tab.titleKey) {
    var tv = resolveKey(data, tab.titleKey);
    if (tv) document.getElementById('dashboard-title').textContent = tab.label + ': ' + tv;
  }

  if (tab.form) {
    var prefill = tab.form.queryParam ? resolveKey(data, tab.form.queryParam) : '';
    c.innerHTML = renderFormHtml(tab.form, prefill) + '<div id="teSectionResult">' + renderSectionsHtml(data, tab.sections) + '</div>';
    wireGenericForm(tab);
    return;
  }

  c.innerHTML = renderSectionsHtml(data, tab.sections);
}

function renderSectionsHtml(data, sections) {
  var html = '';
  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var fn = SEC_RENDERERS[sec.type];
    if (fn) html += fn(data, sec);
  }
  return html;
}

var SEC_RENDERERS = {
  'stats': secStats,
  'label': secLabel,
  'list': secList,
  'scored-list': secScoredList,
  'bands': secBands,
  'banner': secBanner,
  'text': secText,
  'meta': secMeta,
  'alerts': secAlerts,
  'timestamp': secTimestamp,
  'gauge': secGauge,
  'card-grid': secCardGrid,
  'empty-state': secEmptyState,
  'explanations': secExplanations,
};

// --- Stats row ---
function secStats(data, cfg) {
  var items = cfg.items || [];
  if (!items.length) return '';
  var html = '<div class="te-stats-row">';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var value;
    if (it.compute === 'count') {
      value = (resolveKey(data, it.key) || []).length;
    } else if (it.compute === 'countWhere') {
      var arr = resolveKey(data, it.key) || [];
      var w = it.where || {};
      value = 0;
      for (var j = 0; j < arr.length; j++) {
        var fv = resolveKey(arr[j], w.field);
        if (w.eq !== undefined && String(fv).toUpperCase() === String(w.eq).toUpperCase()) value++;
        else if (w.truthy && fv) value++;
      }
    } else {
      value = resolveKey(data, it.key);
    }
    if (it.hideIfZero && !value) continue;
    var display = formatValue(value, it.format);
    var color = it.color || '';
    var badge = '';
    if (it.badge) {
      var bv = resolveKey(data, it.badge.key);
      if (bv) badge = ' <span class="te-stat-badge">' + esc((it.badge.prefix||'') + bv + (it.badge.suffix||'')) + '</span>';
    }
    html += '<div class="te-stat-card">' +
      '<div class="te-stat-value"' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(display) + '</div>' +
      '<div class="te-stat-label">' + esc(it.label || '') + badge + '</div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

// --- Section label ---
function secLabel(data, cfg) {
  var mt = cfg.marginTop ? ' style="margin-top:16px"' : '';
  var countText = '';
  if (cfg.count) countText = cfg.count;
  else if (cfg.countKey) {
    var cv = resolveKey(data, cfg.countKey);
    countText = (cv !== null && cv !== undefined ? String(cv) : '') + (cfg.countSuffix || '');
  }
  return '<div class="te-section-label"' + mt + '><span class="te-section-label-text">' + esc(cfg.text || '') + '</span>' +
    (countText ? '<span class="te-section-label-count">' + esc(countText) + '</span>' : '') + '</div>';
}

// --- Item list ---
function secList(data, cfg) {
  var items = resolveKey(data, cfg.dataKey) || [];
  if (!items.length) {
    if (cfg.emptyTitle) return secEmptyState(data, {title: cfg.emptyTitle, hint: cfg.emptyHint});
    return '';
  }
  var fields = cfg.fields || [];
  var html = '<div class="te-item-list">';
  for (var i = 0; i < items.length; i++) {
    html += '<div class="te-item-row">';
    for (var f = 0; f < fields.length; f++) {
      html += renderField(items[i], fields[f]);
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// --- Scored list (tier badge + score bar per item) ---
function secScoredList(data, cfg) {
  var items = resolveKey(data, cfg.dataKey) || [];
  if (!items.length) return '';
  var html = '<div class="te-scored-list">';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var tier = String(resolveKey(item, cfg.tierKey) || 'low').toLowerCase();
    var score = resolveKey(item, cfg.scoreKey) || 0;
    var pct = Math.round(score * 100);
    var label = resolveKey(item, cfg.labelKey) || '';
    var linkHtml;
    if (cfg.linkTarget) {
      linkHtml = '<span class="te-field-link te-scored-label" data-navigate-tab="' + escAttr(cfg.linkTarget) + '" data-navigate-value="' + escAttr(String(label)) + '">' + esc(String(label)) + '</span>';
    } else {
      linkHtml = '<span class="te-scored-label">' + esc(String(label)) + '</span>';
    }
    html += '<div class="te-scored-entry">' +
      '<span class="te-badge te-badge-' + tier + '">' + esc(tier.toUpperCase()) + '</span>' +
      linkHtml +
      '<div class="te-bar-wrap"><div class="te-bar-fill te-bar-' + tier + '" style="width:' + pct + '%"></div></div>' +
      '<span class="te-bar-pct">' + pct + '%</span>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

// --- Risk bands ---
function secBands(data, cfg) {
  var bands = resolveKey(data, cfg.dataKey) || {};
  var total = resolveKey(data, cfg.totalKey) || 0;
  var tiers = cfg.tiers || [];
  var colors = cfg.colors || {};
  var html = '<div class="te-bands">';
  for (var i = 0; i < tiers.length; i++) {
    var tier = tiers[i];
    var band = bands[tier] || {};
    var count = band.count || 0;
    var pctNum = total > 0 ? (count / total) * 100 : 0;
    var barWidth = Math.min(pctNum * 4, 100);
    var color = colors[tier] || 'var(--text-muted)';
    html += '<div class="te-band-row">' +
      '<span class="te-band-label" style="color:' + color + '">' + tier + '</span>' +
      '<div class="te-bar-wrap"><div class="te-bar-fill" style="width:' + barWidth + '%;background:' + color + '"></div></div>' +
      '<span class="te-band-count">' + count.toLocaleString() + '</span>' +
      '<span class="te-band-pct">' + esc(band.percent_of_total || '0%') + '</span>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

// --- Banner ---
function secBanner(data, cfg) {
  var value = resolveKey(data, cfg.dataKey);
  var variant = value ? (cfg.present || {}) : (cfg.absent || {});
  if (!variant.label) return '';
  var styleClass = variant.style === 'error' ? 'te-banner-error' : 'te-banner-success';
  var meta = '';
  if (variant.metaKeys && value && typeof value === 'object') {
    var parts = [];
    for (var i = 0; i < variant.metaKeys.length; i++) {
      var mk = variant.metaKeys[i];
      var mv = resolveKey(value, mk.key);
      if (mv) parts.push((mk.prefix || '') + String(mv) + (mk.suffix || ''));
    }
    meta = parts.join(' \u00B7 ');
  } else if (variant.meta) {
    meta = variant.meta;
  }
  var extra = '';
  if (variant.badgeKey && value && typeof value === 'object') {
    var bv = resolveKey(value, variant.badgeKey);
    if (bv === variant.badgeMatch) {
      extra = '<span class="te-alert-badge">' + esc(variant.badgeText || '') + '</span>';
    }
  }
  return '<div class="te-banner ' + styleClass + '"><span class="te-banner-label">' + esc(variant.label) + '</span>' +
    (meta ? '<span class="te-banner-meta">' + esc(meta) + '</span>' : '') + extra + '</div>';
}

// --- Text ---
function secText(data, cfg) {
  var text = cfg.value || resolveKey(data, cfg.key) || '';
  if (!text) return '';
  var mt = cfg.marginTop ? ' style="margin-top:10px"' : '';
  return '<div class="te-summary"' + mt + '>' + esc(text) + '</div>';
}

// --- Meta (key-value pairs) ---
function secMeta(data, cfg) {
  var items = cfg.items || [];
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var mi = items[i];
    var value = resolveKey(data, mi.key);
    if (value === null || value === undefined) continue;
    var display = formatValue(value, mi.format);
    html += '<div class="te-meta-row"><span class="te-meta-label">' + esc(mi.label) + ':</span> ' + esc(display) + '</div>';
  }
  return html;
}

// --- Alerts ---
function secAlerts(data, cfg) {
  var alerts = resolveKey(data, cfg.dataKey) || [];
  if (!alerts.length) return '';
  var html = '<div class="te-alerts">';
  for (var i = 0; i < alerts.length; i++) {
    html += '<div class="te-alert-item">' + esc(alerts[i]) + '</div>';
  }
  html += '</div>';
  return html;
}

// --- Timestamp ---
function secTimestamp() {
  return '<div class="te-updated">Updated ' + new Date().toLocaleTimeString() + '</div>';
}

// --- Gauge (semicircle with needle) ---
function secGauge(data, cfg) {
  var prob = resolveKey(data, cfg.valueKey) || 0;
  var assessment = resolveKey(data, cfg.assessmentKey) || '';
  var label = cfg.label || '';
  var color = prob >= 0.6 ? 'var(--error)' : prob >= 0.3 ? 'var(--warning)' : 'var(--success)';
  return '<div class="te-gauge-card"><div class="te-gauge-label">' + esc(label) + '</div>' +
    '<div class="te-gauge"><div class="te-gauge-bg"></div><div class="te-gauge-cover"></div>' +
    '<div class="te-gauge-needle" style="transform:rotate(' + (-90 + prob * 180) + 'deg)"></div></div>' +
    '<div class="te-stat-value" style="color:' + color + '">' + (prob * 100).toFixed(0) + '%</div>' +
    '<div class="te-gauge-text">' + esc(assessment) + '</div></div>';
}

// --- Card grid ---
function secCardGrid(data, cfg) {
  var items = resolveKey(data, cfg.dataKey) || [];
  if (!items.length) return '';
  var html = '<div class="te-card-grid">';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var score = resolveKey(item, cfg.scoreKey) || 0;
    var title = resolveKey(item, cfg.titleKey) || '';
    var desc = resolveKey(item, cfg.descKey) || '';
    var tags = resolveKey(item, cfg.tagsKey) || [];
    var lv = score >= 0.6 ? 'high' : score >= 0.3 ? 'medium' : 'low';
    var tagsHtml = '';
    if (tags.length) {
      tagsHtml = '<div class="te-card-tags">';
      for (var t = 0; t < tags.length; t++) tagsHtml += '<span class="te-tag">' + esc(tags[t].replace(/_/g, ' ')) + '</span>';
      tagsHtml += '</div>';
    }
    var msgData = cfg.messageTemplate ? cfg.messageTemplate.replace('{title}', title).replace('{score}', (score*100).toFixed(0)+'%').replace('{desc}', desc) : '';
    var msgAttr = msgData ? ' data-send-message="' + escAttr(msgData) + '"' : '';
    html += '<div class="te-info-card ' + lv + '"' + msgAttr + ' style="cursor:pointer">' +
      '<div class="te-card-name">' + esc(title) + '</div>' +
      '<span class="te-card-badge ' + lv + '">' + (score * 100).toFixed(0) + '%</span>' +
      '<div class="te-card-desc">' + esc(desc) + '</div>' +
      tagsHtml + '</div>';
  }
  html += '</div>';
  return html;
}

// --- Empty state ---
function secEmptyState(data, cfg) {
  return '<div class="te-prompt">' +
    '<span class="te-prompt-text">' + esc(cfg.title || '') + '</span>' +
    (cfg.hint ? '<span class="te-prompt-hint">' + cfg.hint + '</span>' : '') +
    '</div>';
}

// --- Explanations (tier cards with descriptions) ---
function secExplanations(data, cfg) {
  var items = cfg.items || [];
  if (!items.length) return '';
  var html = '<div class="te-stats-row">';
  for (var i = 0; i < items.length; i++) {
    var ex = items[i];
    html += '<div class="te-stat-card" style="border-left:3px solid ' + (ex.color || 'var(--text-muted)') + '">' +
      '<div class="te-stat-label" style="color:' + (ex.color || 'var(--text-muted)') + ';font-weight:700;font-size:12px">' + esc(ex.label || '') + '</div>' +
      '<div class="te-stat-desc">' + esc(ex.desc || '') + '</div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

// ======================================================================
// Field Renderer (for list items)
// ======================================================================
function renderField(item, field) {
  var value = resolveKey(item, field.key);

  if (field.condition) {
    if (field.condition.eq !== undefined && String(value || '') !== String(field.condition.eq)) return '';
    if (field.condition.neq !== undefined && String(value || '') === String(field.condition.neq)) return '';
    if (field.condition.truthy && !value) return '';
  }

  var style = field.style || 'default';
  var wParts = [];
  if (field.width) wParts.push('width:' + field.width + 'px;flex-shrink:0');
  if (field.flex) wParts.push('flex:' + field.flex + ';min-width:0');
  if (field.align === 'right') wParts.push('margin-left:auto');
  var inlineStyle = wParts.length ? ' style="' + wParts.join(';') + '"' : '';

  switch (field.type || 'text') {
    case 'link':
      var target = field.linkTarget || '';
      return '<span class="te-field-link" data-navigate-tab="' + escAttr(target) + '" data-navigate-value="' + escAttr(String(value || '')) + '"' + inlineStyle + '>' + esc(String(value || '')) + '</span>';

    case 'badge':
      var tierVal = String(value || '').toUpperCase();
      var cm = field.colorMap || {};
      var badgeClass = cm[tierVal] || cm[String(value || '')] || 'default';
      return '<span class="te-badge te-badge-' + badgeClass + '"' + inlineStyle + '>' + esc(tierVal) + '</span>';

    case 'bar':
      var barVal = typeof value === 'number' ? value : 0;
      var pct = Math.round(barVal * (field.multiplier || 100));
      var barColor = 'default';
      if (field.colorKey) barColor = String(resolveKey(item, field.colorKey) || 'default').toLowerCase();
      return '<div class="te-bar-wrap"><div class="te-bar-fill te-bar-' + barColor + '" style="width:' + pct + '%"></div></div>' +
        '<span class="te-bar-pct">' + pct + '%</span>';

    case 'conditional-badge':
      return '<span class="te-alert-badge"' + inlineStyle + '>' + esc(field.text || String(value || '')) + '</span>';

    default:
      var display = formatValue(value, field.format);
      if (field.append) {
        var av = resolveKey(item, field.append.key);
        if (av) display += (field.append.sep || ' ') + formatValue(av, field.append.format);
      }
      return '<span class="te-field-text te-fstyle-' + style + '"' + inlineStyle + '>' + esc(display) + '</span>';
  }
}

// ======================================================================
// Period Toolbar
// ======================================================================
function wireToolbar() {
  document.getElementById('teToolbar').addEventListener('click', function(e) {
    var btn = e.target.closest('.te-period-btn'); if (!btn || btn.disabled) return;
    var period = btn.dataset.period, tabId = eS.activeTab; if (!tabId || period === eS.tabPeriod[tabId]) return;
    var tab = TAB_MAP[tabId]; if (!tab || !tab.hasPeriod) return;
    eS.tabPeriod[tabId] = period; setPeriodUI(period);
    var btns = document.querySelectorAll('.te-period-btn'); for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    var args = { period: period };
    if (tab.defaultArgs) { for (var k in tab.defaultArgs) args[k] = tab.defaultArgs[k]; }
    if (tab.needsArgs) {
      var orig = state.lastToolInput || {};
      for (var k in orig) { if (k !== 'period' && args[k] === undefined) args[k] = orig[k]; }
      var cached = eS.tabData[tabId];
      if (cached && cached.series && cached.series.length >= 2 && !args.series_a) {
        args.series_a = cached.series[0].series_id; args.series_b = cached.series[1].series_id;
      }
    }
    callTool(tab.tool, args).then(function(result) { if (eS.activeTab !== tabId) return; var data = extractData(result); if (data) { eS.tabData[tabId] = data; renderTabContent(tabId, data); } })
      .catch(function(err) { showError(err.message); }).finally(function() { var b2 = document.querySelectorAll('.te-period-btn'); for (var j = 0; j < b2.length; j++) b2[j].disabled = false; });
  });
}

// ======================================================================
// Refresh
// ======================================================================
function refreshCurrentTab() {
  var tabId = eS.activeTab;
  if (!tabId || !state.mcpInitialized) return Promise.resolve();
  var tab = TAB_MAP[tabId];
  if (!tab || !tab.tool) return Promise.resolve();
  var args = {};
  if (tab.hasPeriod) args.period = eS.tabPeriod[tabId] || DEF_PERIOD;
  if (tab.defaultArgs) { for (var k in tab.defaultArgs) args[k] = tab.defaultArgs[k]; }
  return callTool(tab.tool, args).then(function(result) {
    if (eS.activeTab !== tabId) return;
    var data = extractData(result);
    if (data) { eS.tabData[tabId] = data; renderTabContent(tabId, data); }
  }).catch(function(err) { showError(err.message); });
}

// ======================================================================
// Bootstrap
// ======================================================================
function bootstrap() {
  renderDashboard = function(data) {
    onInitialData(data);
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

})();
