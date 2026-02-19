/**
 * Tabbed Dashboard Engine — multi-tool tabbed navigation with canvas charts.
 * Config-driven via window.__APP_CONFIG__.
 *
 * Config shape:
 *   tabs:             [{id, label, tool, type, hasPeriod, needsArgs, defaultArgs, promptTitle, promptHint, searchPlaceholder}]
 *   toolCatalog:      [{name, label, icon, desc, usage, source, stateful}]
 *   toolCatalogIntro: string (HTML)
 *   periods:          ["1y","2y","5y",...]
 *   defaultPeriod:    "5y"
 *   footerText:       "FRED · BLS · ..."
 *   colors:           ["#3b82f6",...]
 *   toolName:         "open_economic_app"  (the tool that opens the app)
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
    if (tab.type === 'search') renderSearchForm(tab);
    else renderPromptView(tab.promptTitle || 'This view requires specific inputs', tab.promptHint || 'Ask your AI to call the appropriate tool');
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

function onInitialData(data) {
  buildUI();
  var tabId = state.toolName ? TOOL_TO_TAB[state.toolName] : null;
  if (!tabId) {
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      if (t.type === 'dashboard' && data.recession_probability) { tabId = t.id; break; }
      if (t.type === 'search' && data.query) { tabId = t.id; break; }
      if (t.type === 'banking' && data.health_summary) { tabId = t.id; break; }
      if (t.type === 'chart' && data.series) { tabId = t.id; break; }
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
  if (tab.type === 'dashboard') renderDashboardView(data);
  else if (tab.type === 'chart') renderChartView(data);
  else if (tab.type === 'banking') renderBankingView(data);
  else if (tab.type === 'search') renderSearchResults(data);
}

function updateHeaderActions(tabId) {
  var data = eS.tabData[tabId];
  var tab = TAB_MAP[tabId];
  if (tab.type === 'tools' || !data) { clearHeaderActions(); return; }
  addViewActions(
    function() {
      var ctx = '';
      if (tab.type === 'dashboard') {
        var p = data.recession_probability ? data.recession_probability.probability || 0 : 0;
        ctx = 'Recession probability: ' + (p*100).toFixed(0) + '%\n' + (data.recession_probability ? data.recession_probability.assessment || '' : '') + '\n\n' + (data.signals || []).map(function(s) { return s.title + ': ' + s.summary; }).join('\n');
      } else {
        ctx = (data.title || tab.label) + '\n' + (data.summary || '');
      }
      return { question: 'Analyze this data. Key takeaways?', context: ctx };
    },
    function() { return refreshCurrentTab(); }
  );
}

function teShowLoading(t) { document.getElementById('teContent').innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>' + esc(t) + '</span></div>'; }
function renderPromptView(title, hint) { document.getElementById('teContent').innerHTML = '<div class="te-prompt"><span class="te-prompt-text">' + esc(title) + '</span><span class="te-prompt-hint">' + esc(hint) + '</span></div>'; }

// ======================================================================
// Chart View
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
// Dashboard (Overview)
// ======================================================================
function renderDashboardView(data) {
  var recession = data.recession_probability || {}, prob = recession.probability || 0, signals = data.signals || [];
  document.getElementById('dashboard-title').textContent = 'Economic Outlook';
  var c = document.getElementById('teContent');
  c.innerHTML =
    '<div class="te-prob-card"><div class="te-prob-label">Recession Probability</div>' +
    '<div class="te-gauge"><div class="te-gauge-bg"></div><div class="te-gauge-cover"></div><div class="te-gauge-needle" id="teNeedle"></div></div>' +
    '<div class="te-prob-value" id="tePv">\u2014</div><div class="te-prob-text" id="tePt"></div></div>' +
    '<div class="te-section-label"><span class="te-section-label-text">Economic Signals</span><span class="te-section-label-count" id="teSc"></span></div>' +
    '<div class="te-signals-grid" id="teSg"></div><div class="te-updated" id="teUpd"></div>';

  var pvEl = document.getElementById('tePv');
  pvEl.textContent = (prob * 100).toFixed(0) + '%';
  pvEl.style.color = prob >= 0.6 ? 'var(--error)' : prob >= 0.3 ? 'var(--warning)' : 'var(--success)';
  document.getElementById('teNeedle').style.transform = 'rotate(' + (-90 + prob * 180) + 'deg)';
  document.getElementById('tePt').textContent = recession.assessment || data.summary || '';
  document.getElementById('teSc').textContent = signals.length + ' signal' + (signals.length !== 1 ? 's' : '');

  var grid = document.getElementById('teSg');
  for (var i = 0; i < signals.length; i++) {
    (function(sig) {
      var lv = sig.score >= 0.6 ? 'high' : sig.score >= 0.3 ? 'medium' : 'low';
      var card = document.createElement('div'); card.className = 'te-signal-card ' + lv;
      var tags = '';
      if (sig.tags && sig.tags.length) { tags = '<div class="te-signal-tags">'; for (var t = 0; t < sig.tags.length; t++) tags += '<span class="te-tag">' + esc(sig.tags[t].replace(/_/g, ' ')) + '</span>'; tags += '</div>'; }
      card.innerHTML = '<div class="te-signal-name">' + esc(sig.title) + '</div><span class="te-signal-badge ' + lv + '">' + (sig.score * 100).toFixed(0) + '%</span><div class="te-signal-desc">' + esc(sig.summary) + '</div>' + tags;
      card.addEventListener('click', function() { sendMessage('[Signal] ' + sig.title + ' (' + (sig.score*100).toFixed(0) + '%) \u2014 ' + sig.summary + '\n\nExplain this signal.').catch(function(){}); });
      grid.appendChild(card);
    })(signals[i]);
  }
  document.getElementById('teUpd').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ======================================================================
// Banking
// ======================================================================
function renderBankingView(data) {
  var h = data.health_summary || {}, fails = data.recent_failures || [];
  document.getElementById('dashboard-title').textContent = 'Banking System Health';
  var c = document.getElementById('teContent');
  var stats = '<div class="te-health-grid">';
  var items = [{ l:'Institutions', v:h.total_institutions }, { l:'Problem Banks', v:h.problem_institutions }, { l:'Total Assets', v:h.total_assets?'$'+(h.total_assets/1e12).toFixed(1)+'T':null }, { l:'Recent Failures', v:data.failure_count }];
  for (var i = 0; i < items.length; i++) { if (items[i].v !== null && items[i].v !== undefined) stats += '<div class="te-health-stat"><div class="te-health-val">' + items[i].v + '</div><div class="te-health-label">' + items[i].l + '</div></div>'; }
  stats += '</div>';
  var fl = '';
  if (fails.length) { fl = '<div class="te-failures-title">Recent Failures</div>'; for (var f = 0; f < Math.min(fails.length, 12); f++) { var r = fails[f]; fl += '<div class="te-failure-item"><span class="te-failure-name">' + esc(r.institution||r.name||'Unknown') + '</span><span class="te-failure-meta">' + esc((r.city||'')+(r.state?', '+r.state:'')+(r.failure_date?' \u00B7 '+r.failure_date:'')) + '</span></div>'; } }
  c.innerHTML = stats + fl + '<div class="te-summary">' + esc(data.summary || h.assessment || '') + '</div>';
}

// ======================================================================
// Search
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
    callTool(searchTab.tool,{query:q,limit:20}).then(function(res){var d=extractData(res);if(d){eS.tabData[searchTab.id]=d;showSearchItems(d);document.getElementById('dashboard-title').textContent='Search: '+q;}}).catch(function(e){showError(e.message);}).finally(function(){btn.disabled=false;btn.textContent='Search';}); }
  btn.addEventListener('click', go); inp.addEventListener('keydown', function(e){if(e.key==='Enter')go();});
}

function showSearchItems(data) {
  var results = data.results || [], el = document.getElementById('teSr');
  if (!results.length) { el.innerHTML = '<div class="te-prompt"><span class="te-prompt-text">No results</span></div>'; return; }
  var html = '';
  for (var i = 0; i < results.length; i++) { var r = results[i]; html += '<div class="te-search-item"><div class="te-search-item-title">' + esc(r.title||r.name||'') + '<span class="te-search-item-id">' + esc(r.id||r.series_id||'') + '</span></div><div class="te-search-item-meta">' + esc([r.frequency,r.units,r.seasonal_adjustment].filter(Boolean).join(' \u00B7 ')) + '</div></div>'; }
  el.innerHTML = html;
}

// ======================================================================
// Tools Reference
// ======================================================================
function renderToolsView() {
  document.getElementById('dashboard-title').textContent = 'Available Tools';
  var c = document.getElementById('teContent');

  var html = '';
  if (cfg.toolCatalogIntro) {
    html = '<div class="te-tools-intro">' + cfg.toolCatalogIntro + '</div>';
  } else {
    html = '<div class="te-tools-intro">This server provides <strong>' + TOOL_CATALOG.length + ' tools</strong> your AI can call directly. All tools are <strong>read-only</strong>.</div>';
  }

  for (var i = 0; i < TOOL_CATALOG.length; i++) {
    var t = TOOL_CATALOG[i];
    var isApp = t.name === (cfg.toolName || '');
    var isStateful = t.stateful;
    var badgeClass = isApp ? ' interactive' : isStateful ? ' stateful' : '';
    var badgeLabel = isApp ? 'interactive' : isStateful ? 'stateful' : 'read-only';
    html += '<div class="te-tool-card"><div class="te-tool-card-head">' +
      '<span class="te-tool-card-icon">' + t.icon + '</span>' +
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
// Bootstrap — override renderDashboard
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
