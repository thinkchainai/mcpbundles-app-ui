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
    else if (tab.type === 'vuln-lookup') renderVulnLookupForm(tab);
    else if (tab.type === 'vuln-triage') renderVulnTriageForm(tab);
    else if (tab.type === 'vuln-vendor') renderVulnVendorForm(tab);
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
      if (t.type === 'vuln-briefing' && (data.kev_recent || data.top_epss)) { tabId = t.id; break; }
      if (t.type === 'vuln-list' && data.entries && data.total_in_window !== undefined) { tabId = t.id; break; }
      if (t.type === 'vuln-stats' && data.risk_bands) { tabId = t.id; break; }
      if (t.type === 'vuln-lookup' && data.cve_id && data.risk) { tabId = t.id; break; }
      if (t.type === 'vuln-triage' && data.buckets) { tabId = t.id; break; }
      if (t.type === 'vuln-vendor' && data.vendor && data.products) { tabId = t.id; break; }
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
  else if (tab.type === 'vuln-briefing') renderVulnBriefingView(data);
  else if (tab.type === 'vuln-list') renderVulnListView(data);
  else if (tab.type === 'vuln-stats') renderVulnStatsView(data);
  else if (tab.type === 'vuln-lookup') renderVulnLookupResult(data);
  else if (tab.type === 'vuln-triage') renderVulnTriageResult(data);
  else if (tab.type === 'vuln-vendor') renderVulnVendorResult(data);
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
    var args = {};
    var queryParam = searchTab.searchQueryParam || 'query';
    var limitParam = searchTab.searchLimitParam || 'limit';
    args[queryParam] = q; args[limitParam] = 20;
    callTool(searchTab.tool,args).then(function(res){var d=extractData(res);if(d){eS.tabData[searchTab.id]=d;showSearchItems(d);document.getElementById('dashboard-title').textContent='Search: '+q;}}).catch(function(e){showError(e.message);}).finally(function(){btn.disabled=false;btn.textContent='Search';}); }
  btn.addEventListener('click', go); inp.addEventListener('keydown', function(e){if(e.key==='Enter')go();});
}

var SEV_BADGE_LEVELS = { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true };
function sevBadgeHtml(sev) {
  var upper = (sev || '').toUpperCase();
  if (!SEV_BADGE_LEVELS[upper]) return sev ? '<span class="te-search-item-id">' + esc(sev) + '</span>' : '';
  return '<span class="te-vuln-severity te-sev-' + upper.toLowerCase() + '" style="margin-left:6px;vertical-align:middle">' + upper + '</span>';
}

function showSearchItems(data) {
  var results = data.results || [], el = document.getElementById('teSr');
  if (!results.length) { el.innerHTML = '<div class="te-prompt"><span class="te-prompt-text">No results</span></div>'; return; }
  var html = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var meta = [r.units, r.seasonal_adjustment].filter(Boolean).join(' \u00B7 ');
    html += '<div class="te-search-item"><div class="te-search-item-title">' + esc(r.title||r.name||'') + '<span class="te-search-item-id">' + esc(r.id||r.series_id||'') + '</span>' + sevBadgeHtml(r.frequency) + '</div>' + (meta ? '<div class="te-search-item-meta">' + esc(meta) + '</div>' : '') + '</div>';
  }
  el.innerHTML = html;
}

// ======================================================================
// Vulnerability Briefing (Threat Overview)
// ======================================================================
function renderVulnBriefingView(data) {
  document.getElementById('dashboard-title').textContent = 'Threat Briefing';
  var c = document.getElementById('teContent');
  var kevRecent = data.kev_recent || [];
  var topEpss = data.top_epss || [];

  var statsHtml =
    '<div class="te-vuln-stats-row">' +
      '<div class="te-vuln-stat">' +
        '<div class="te-vuln-stat-value">' + esc(String(data.new_cves_7d !== undefined ? data.new_cves_7d.toLocaleString() : '\u2014')) + '</div>' +
        '<div class="te-vuln-stat-label">New CVEs (last 7 days)</div>' +
      '</div>' +
      '<div class="te-vuln-stat">' +
        '<div class="te-vuln-stat-value">' + esc(String(data.kev_total !== undefined ? data.kev_total.toLocaleString() : '\u2014')) + '</div>' +
        '<div class="te-vuln-stat-label">CISA KEV Total' + (data.kev_added_7d ? ' <span class="te-vuln-stat-badge">+' + data.kev_added_7d + ' this week</span>' : '') + '</div>' +
      '</div>' +
      (data.ransomware_linked ? '<div class="te-vuln-stat">' +
        '<div class="te-vuln-stat-value">' + esc(String(data.ransomware_linked.toLocaleString())) + '</div>' +
        '<div class="te-vuln-stat-label">KEV Ransomware-Linked</div>' +
      '</div>' : '') +
    '</div>';

  var kevHtml = '';
  if (kevRecent.length) {
    kevHtml = '<div class="te-section-label"><span class="te-section-label-text">Just Added to CISA KEV</span><span class="te-section-label-count">confirmed exploited in the wild</span></div><div class="te-kev-list">';
    for (var i = 0; i < kevRecent.length; i++) {
      var e = kevRecent[i];
      var isRW = e.ransomware_use === 'Known';
      kevHtml += '<div class="te-kev-entry">' +
        '<span class="te-kev-badge">' + esc(e.cve_id || '') + '</span>' +
        '<span class="te-kev-vendor">' + esc((e.vendor || '') + (e.product ? ' \u00B7 ' + e.product : '')) + '</span>' +
        (isRW ? '<span class="te-kev-ransomware">\u26A0 Ransomware</span>' : '') +
        '<span class="te-kev-date">' + esc(e.date_added || '') + '</span>' +
        '</div>';
    }
    kevHtml += '</div>';
  }

  var epssHtml = '';
  if (topEpss.length) {
    epssHtml = '<div class="te-section-label" style="margin-top:16px"><span class="te-section-label-text">Highest Exploit Probability</span><span class="te-section-label-count">most likely exploited in next 30 days</span></div><div class="te-epss-list">';
    for (var j = 0; j < topEpss.length; j++) {
      var s = topEpss[j];
      var pct = Math.round((s.epss_score || 0) * 100);
      var lvl = (s.risk_level || 'low').toLowerCase();
      epssHtml += '<div class="te-epss-entry">' +
        '<span class="te-vuln-severity te-sev-' + lvl + '">' + esc(s.risk_level || '') + '</span>' +
        '<span class="te-epss-cve">' + esc(s.cve || '') + '</span>' +
        '<div class="te-epss-bar-wrap"><div class="te-epss-bar te-sev-bar-' + lvl + '" style="width:' + pct + '%"></div></div>' +
        '<span class="te-epss-pct">' + pct + '%</span>' +
        '</div>';
    }
    epssHtml += '</div>';
  }

  c.innerHTML = statsHtml + kevHtml + epssHtml + '<div class="te-summary">' + esc(data.summary || '') + '</div><div class="te-updated">Updated ' + new Date().toLocaleTimeString() + '</div>';
}

// ======================================================================
// Vulnerability List (KEV Feed)
// ======================================================================
function renderVulnListView(data) {
  document.getElementById('dashboard-title').textContent = 'Actively Exploited';
  var c = document.getElementById('teContent');
  var entries = data.entries || [];
  var header = '<div class="te-section-label"><span class="te-section-label-text">CISA Known Exploited Vulnerabilities</span><span class="te-section-label-count">' + esc(String(data.total_in_window || entries.length)) + ' added in past ' + esc(String(data.days_back || 30)) + ' days</span></div>';
  if (!entries.length) {
    c.innerHTML = header + '<div class="te-loading"><span>No entries in this window</span></div>';
    return;
  }
  var listHtml = '<div class="te-kev-list">';
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var isRW = e.ransomware_use === 'Known';
    listHtml += '<div class="te-kev-entry te-kev-entry-full">' +
      '<span class="te-kev-badge">' + esc(e.cve_id || '') + '</span>' +
      '<div class="te-kev-detail">' +
        '<div class="te-kev-name">' + esc(e.vulnerability_name || ((e.vendor || '') + ' ' + (e.product || ''))) + '</div>' +
        '<div class="te-kev-meta">' + esc(e.vendor || '') + (e.product ? ' \u00B7 ' + e.product : '') + (e.due_date ? ' \u00B7 Due: ' + e.due_date : '') + '</div>' +
      '</div>' +
      (isRW ? '<span class="te-kev-ransomware">\u26A0 Ransomware</span>' : '') +
      '<span class="te-kev-date">' + esc(e.date_added || '') + '</span>' +
      '</div>';
  }
  listHtml += '</div>';
  c.innerHTML = header + listHtml;
}

// ======================================================================
// Vulnerability Stats (EPSS Risk Landscape)
// ======================================================================
function renderVulnStatsView(data) {
  document.getElementById('dashboard-title').textContent = 'Risk Landscape';
  var c = document.getElementById('teContent');
  var bands = data.risk_bands || {};
  var total = data.total_scored || 0;
  var order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  var colors = { CRITICAL: 'var(--error)', HIGH: '#f97316', MEDIUM: 'var(--warning)', LOW: 'var(--success)' };

  var html = '<div class="te-section-label"><span class="te-section-label-text">EPSS Risk Distribution</span><span class="te-section-label-count">' + total.toLocaleString() + ' CVEs scored</span></div><div class="te-risk-bands">';
  for (var i = 0; i < order.length; i++) {
    var tier = order[i];
    var band = bands[tier] || {};
    var count = band.count || 0;
    var pctNum = total > 0 ? (count / total) * 100 : 0;
    var barWidth = Math.min(pctNum * 4, 100);
    html += '<div class="te-risk-band">' +
      '<span class="te-risk-band-label" style="color:' + colors[tier] + '">' + tier + '</span>' +
      '<div class="te-risk-band-track"><div class="te-risk-band-fill" style="width:' + barWidth + '%;background:' + colors[tier] + '"></div></div>' +
      '<span class="te-risk-band-count">' + count.toLocaleString() + '</span>' +
      '<span class="te-risk-band-pct">' + esc(band.percent_of_total || '0%') + '</span>' +
      '</div>';
  }
  html += '</div>';

  var explanations = [
    { tier: 'CRITICAL', color: 'var(--error)', desc: 'EPSS > 70% \u2014 very high probability of exploitation in 30 days.' },
    { tier: 'HIGH', color: '#f97316', desc: 'EPSS 40\u201370% \u2014 elevated risk. Prioritize if in your tech stack.' },
    { tier: 'MEDIUM', color: 'var(--warning)', desc: 'EPSS 10\u201340% \u2014 moderate risk. Patch in normal cycle.' },
    { tier: 'LOW', color: 'var(--success)', desc: 'EPSS < 10% \u2014 low exploitation probability. Routine handling.' },
  ];
  html += '<div class="te-section-label" style="margin-top:16px"><span class="te-section-label-text">EPSS Score Bands Explained</span></div><div class="te-vuln-stats-row">';
  for (var j = 0; j < explanations.length; j++) {
    var ex = explanations[j];
    html += '<div class="te-vuln-stat" style="border-left:3px solid ' + ex.color + '">' +
      '<div class="te-vuln-stat-label" style="color:' + ex.color + ';font-weight:700;font-size:12px">' + ex.tier + '</div>' +
      '<div class="te-vuln-stat-desc">' + esc(ex.desc) + '</div>' +
      '</div>';
  }
  html += '</div>';
  html += '<div class="te-summary">' + esc(data.summary || ('EPSS score distribution across ' + total.toLocaleString() + ' scored CVEs from FIRST.org.')) + '</div>';
  c.innerHTML = html;
}

// ======================================================================
// CVE Analyzer (vuln-lookup)
// ======================================================================
function sevColor(tier) {
  var map = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#10b981', NONE: 'var(--text-muted)' };
  return map[(tier || '').toUpperCase()] || 'var(--text-primary)';
}

function renderVulnLookupForm(tab) {
  document.getElementById('dashboard-title').textContent = 'CVE Analyzer';
  var placeholder = tab.searchPlaceholder || 'Enter CVE ID — e.g. CVE-2021-44228';
  document.getElementById('teContent').innerHTML =
    '<div class="te-search-form"><input class="te-search-input" id="teLookupInput" type="text" placeholder="' + escAttr(placeholder) + '" /><button class="te-search-btn" id="teLookupBtn">Analyze</button></div>' +
    '<div id="teLookupResult"><div class="te-prompt"><span class="te-prompt-text">Enter a CVE ID for full cross-source analysis</span><span class="te-prompt-hint">CVSS severity \u00B7 EPSS exploit probability \u00B7 CISA KEV status</span></div></div>';
  wireLookup(tab);
  document.getElementById('teLookupInput').focus();
}

function wireLookup(tab) {
  var inp = document.getElementById('teLookupInput');
  var btn = document.getElementById('teLookupBtn');
  var queryParam = tab.searchQueryParam || 'cve_id';
  function go() {
    var q = inp.value.trim().toUpperCase();
    if (!q) return;
    btn.disabled = true; btn.textContent = 'Analyzing\u2026';
    var resultEl = document.getElementById('teLookupResult');
    if (resultEl) resultEl.innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>Analyzing ' + esc(q) + '\u2026</span></div>';
    var args = {}; args[queryParam] = q;
    callTool(tab.tool, args).then(function(res) {
      var d = extractData(res);
      if (d) { eS.tabData[tab.id] = d; renderVulnLookupResult(d); }
    }).catch(function(e) { showError(e.message); }).finally(function() { btn.disabled = false; btn.textContent = 'Analyze'; });
  }
  btn.addEventListener('click', go);
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') go(); });
}

function renderVulnLookupResult(data) {
  var cveId = data.cve_id || '';
  document.getElementById('dashboard-title').textContent = cveId ? 'CVE Analyzer: ' + cveId : 'CVE Analyzer';
  var resultEl = document.getElementById('teLookupResult');
  if (!resultEl) {
    var lookupTab = null;
    for (var ti = 0; ti < TABS.length; ti++) { if (TABS[ti].type === 'vuln-lookup') { lookupTab = TABS[ti]; break; } }
    var ph = (lookupTab && lookupTab.searchPlaceholder) || 'Enter CVE ID \u2014 e.g. CVE-2021-44228';
    document.getElementById('teContent').innerHTML =
      '<div class="te-search-form"><input class="te-search-input" id="teLookupInput" type="text" value="' + escAttr(cveId) + '" placeholder="' + escAttr(ph) + '" /><button class="te-search-btn" id="teLookupBtn">Analyze</button></div>' +
      '<div id="teLookupResult"></div>';
    if (lookupTab) wireLookup(lookupTab);
    resultEl = document.getElementById('teLookupResult');
  }

  var risk = data.risk || {}, nvd = data.nvd || {}, epss = data.epss || {}, kev = data.kev;
  var tier = (risk.tier || 'LOW').toUpperCase();
  var cvssScore = risk.cvss_base_score !== null && risk.cvss_base_score !== undefined ? String(risk.cvss_base_score) : '\u2014';
  var cvssLabel = (nvd.cvss_v3 && nvd.cvss_v3.base_severity) ? nvd.cvss_v3.base_severity : '';
  var epssDisplay = epss.epss_percent || (epss.epss_score !== undefined ? (epss.epss_score * 100).toFixed(2) + '%' : '\u2014');
  var epssLabel = epss.percentile_label || '';
  var composite = risk.composite_score !== undefined ? risk.composite_score.toFixed(1) + '/10' : '\u2014';

  var statsHtml = '<div class="te-vuln-stats-row">' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value" style="color:' + sevColor(cvssLabel || tier) + '">' + esc(cvssScore) + '</div><div class="te-vuln-stat-label">CVSS Score' + (cvssLabel ? ' \u00B7 ' + cvssLabel : '') + '</div></div>' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value" style="color:' + sevColor(epss.risk_level || tier) + '">' + esc(epssDisplay) + '</div><div class="te-vuln-stat-label">EPSS Probability' + (epssLabel ? ' \u00B7 ' + epssLabel : '') + '</div></div>' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value" style="color:' + sevColor(tier) + '">' + esc(composite) + '</div><div class="te-vuln-stat-label">Composite Risk \u00B7 ' + tier + '</div></div>' +
    '</div>';

  var kevHtml = kev
    ? '<div class="te-kev-banner te-kev-banner-confirmed"><span class="te-kev-banner-label">CISA KEV \u2014 Actively Exploited</span><span class="te-kev-banner-meta">' + esc((kev.vendor||'') + (kev.product?' \u00B7 '+kev.product:'') + (kev.date_added?' \u00B7 Added '+kev.date_added:'') + (kev.due_date?' \u00B7 Federal deadline: '+kev.due_date:'')) + '</span>' + (kev.ransomware_use==='Known'?'<span class="te-kev-ransomware">\u26A0 Ransomware</span>':'') + '</div>'
    : '<div class="te-kev-banner te-kev-banner-clear"><span class="te-kev-banner-label">Not in CISA KEV</span><span class="te-kev-banner-meta">No confirmed active exploitation on record</span></div>';

  var descHtml = nvd.description ? '<div class="te-lookup-desc">' + esc(nvd.description) + '</div>' : '';
  var weakHtml = (nvd.weaknesses && nvd.weaknesses.length) ? '<div class="te-lookup-meta"><span class="te-lookup-meta-label">Weaknesses:</span> ' + esc(nvd.weaknesses.join(', ')) + '</div>' : '';
  var pubHtml = nvd.published ? '<div class="te-lookup-meta"><span class="te-lookup-meta-label">Published:</span> ' + esc(nvd.published.substring(0, 10)) + '</div>' : '';
  var rationaleHtml = risk.rationale ? '<div class="te-summary" style="margin-top:10px">' + esc(risk.rationale) + '</div>' : '';

  resultEl.innerHTML = statsHtml + kevHtml + descHtml + weakHtml + pubHtml + rationaleHtml;
}

// ======================================================================
// Scan Triage (vuln-triage)
// ======================================================================
function renderVulnTriageForm(tab) {
  document.getElementById('dashboard-title').textContent = 'Scan Triage';
  var placeholder = tab.searchPlaceholder || 'CVE-2021-44228, CVE-2022-1388, \u2026';
  document.getElementById('teContent').innerHTML =
    '<div class="te-triage-form"><textarea class="te-triage-input" id="teTriageInput" placeholder="' + escAttr(placeholder) + '" rows="3"></textarea><button class="te-search-btn" id="teTriageBtn">Triage</button></div>' +
    '<div id="teTriageResult"><div class="te-prompt"><span class="te-prompt-text">Paste CVE IDs from a scan to prioritize by exploit risk</span><span class="te-prompt-hint">Comma-separated \u00B7 Scored via FIRST EPSS</span></div></div>';
  wireTriage(tab);
  document.getElementById('teTriageInput').focus();
}

function wireTriage(tab) {
  var inp = document.getElementById('teTriageInput');
  var btn = document.getElementById('teTriageBtn');
  var queryParam = tab.searchQueryParam || 'cve_ids';
  function go() {
    var q = inp.value.trim();
    if (!q) return;
    btn.disabled = true; btn.textContent = 'Triaging\u2026';
    var resultEl = document.getElementById('teTriageResult');
    if (resultEl) resultEl.innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>Scoring CVEs\u2026</span></div>';
    var args = {}; args[queryParam] = q;
    callTool(tab.tool, args).then(function(res) {
      var d = extractData(res);
      if (d) { eS.tabData[tab.id] = d; renderVulnTriageResult(d); }
    }).catch(function(e) { showError(e.message); }).finally(function() { btn.disabled = false; btn.textContent = 'Triage'; });
  }
  btn.addEventListener('click', go);
}

function renderVulnTriageResult(data) {
  document.getElementById('dashboard-title').textContent = 'Scan Triage';
  var resultEl = document.getElementById('teTriageResult');
  if (!resultEl) {
    var triageTab = null;
    for (var ti = 0; ti < TABS.length; ti++) { if (TABS[ti].type === 'vuln-triage') { triageTab = TABS[ti]; break; } }
    var ph = (triageTab && triageTab.searchPlaceholder) || 'CVE-2021-44228, CVE-2022-1388, \u2026';
    document.getElementById('teContent').innerHTML =
      '<div class="te-triage-form"><textarea class="te-triage-input" id="teTriageInput" placeholder="' + escAttr(ph) + '" rows="3"></textarea><button class="te-search-btn" id="teTriageBtn">Triage</button></div>' +
      '<div id="teTriageResult"></div>';
    if (triageTab) wireTriage(triageTab);
    resultEl = document.getElementById('teTriageResult');
  }

  var buckets = data.buckets || {}, submitted = data.total_submitted || 0, scored = data.total_scored || 0, unscored = data.unscored_cves || [];
  var TIERS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  var tierColors = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#10b981' };

  var statsHtml = '<div class="te-vuln-stats-row">' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value">' + submitted + '</div><div class="te-vuln-stat-label">Submitted</div></div>' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value">' + scored + '</div><div class="te-vuln-stat-label">Scored</div></div>' +
    (unscored.length ? '<div class="te-vuln-stat"><div class="te-vuln-stat-value te-sev-text-medium">' + unscored.length + '</div><div class="te-vuln-stat-label">Not in EPSS</div></div>' : '') +
    '</div>';

  var tiersHtml = '';
  for (var t = 0; t < TIERS.length; t++) {
    var tier = TIERS[t], cves = buckets[tier] || [];
    if (!cves.length) continue;
    tiersHtml += '<div class="te-triage-tier"><div class="te-section-label"><span class="te-section-label-text" style="color:' + tierColors[tier] + '">' + tier + '</span><span class="te-section-label-count">' + cves.length + ' CVE' + (cves.length !== 1 ? 's' : '') + '</span></div><div class="te-epss-list">';
    for (var ci = 0; ci < cves.length; ci++) {
      var s = cves[ci], pct = Math.round((s.epss_score || 0) * 100), lvl = (s.risk_level || 'low').toLowerCase();
      tiersHtml += '<div class="te-epss-entry"><span class="te-vuln-severity te-sev-' + lvl + '">' + esc(s.risk_level || '') + '</span><span class="te-epss-cve">' + esc(s.cve || '') + '</span><div class="te-epss-bar-wrap"><div class="te-epss-bar te-sev-bar-' + lvl + '" style="width:' + pct + '%"></div></div><span class="te-epss-pct">' + pct + '%</span></div>';
    }
    tiersHtml += '</div></div>';
  }
  if (!tiersHtml) tiersHtml = '<div class="te-loading"><span>No CVEs could be scored — EPSS may not have records for these IDs</span></div>';
  var unscoredHtml = unscored.length ? '<div class="te-lookup-meta" style="margin-top:10px"><span class="te-lookup-meta-label">Not in EPSS:</span> ' + esc(unscored.join(', ')) + '</div>' : '';

  resultEl.innerHTML = statsHtml + tiersHtml + unscoredHtml;
}

// ======================================================================
// Vendor Exposure (vuln-vendor)
// ======================================================================
function renderVulnVendorForm(tab) {
  document.getElementById('dashboard-title').textContent = 'Vendor Exposure';
  var placeholder = tab.searchPlaceholder || 'Vendor name \u2014 e.g. Microsoft';
  document.getElementById('teContent').innerHTML =
    '<div class="te-search-form"><input class="te-search-input" id="teVendorInput" type="text" placeholder="' + escAttr(placeholder) + '" /><button class="te-search-btn" id="teVendorBtn">Analyze</button></div>' +
    '<div id="teVendorResult"><div class="te-prompt"><span class="te-prompt-text">Enter a vendor name to see their CISA KEV exposure</span><span class="te-prompt-hint">All products with confirmed actively-exploited CVEs</span></div></div>';
  wireVendor(tab);
  document.getElementById('teVendorInput').focus();
}

function wireVendor(tab) {
  var inp = document.getElementById('teVendorInput');
  var btn = document.getElementById('teVendorBtn');
  var queryParam = tab.searchQueryParam || 'vendor';
  function go() {
    var q = inp.value.trim();
    if (!q) return;
    btn.disabled = true; btn.textContent = 'Analyzing\u2026';
    var resultEl = document.getElementById('teVendorResult');
    if (resultEl) resultEl.innerHTML = '<div class="te-loading"><div class="te-spinner"></div><span>Looking up ' + esc(q) + '\u2026</span></div>';
    var args = {}; args[queryParam] = q;
    callTool(tab.tool, args).then(function(res) {
      var d = extractData(res);
      if (d) { eS.tabData[tab.id] = d; renderVulnVendorResult(d); }
    }).catch(function(e) { showError(e.message); }).finally(function() { btn.disabled = false; btn.textContent = 'Analyze'; });
  }
  btn.addEventListener('click', go);
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') go(); });
}

function renderVulnVendorResult(data) {
  var vendor = data.vendor || '';
  document.getElementById('dashboard-title').textContent = vendor ? 'Vendor: ' + vendor : 'Vendor Exposure';
  var resultEl = document.getElementById('teVendorResult');
  if (!resultEl) {
    var vendorTab = null;
    for (var ti = 0; ti < TABS.length; ti++) { if (TABS[ti].type === 'vuln-vendor') { vendorTab = TABS[ti]; break; } }
    var ph = (vendorTab && vendorTab.searchPlaceholder) || 'Vendor name \u2014 e.g. Microsoft';
    document.getElementById('teContent').innerHTML =
      '<div class="te-search-form"><input class="te-search-input" id="teVendorInput" type="text" value="' + escAttr(vendor) + '" placeholder="' + escAttr(ph) + '" /><button class="te-search-btn" id="teVendorBtn">Analyze</button></div>' +
      '<div id="teVendorResult"></div>';
    if (vendorTab) wireVendor(vendorTab);
    resultEl = document.getElementById('teVendorResult');
  }

  if (!data.total_kev_entries) {
    resultEl.innerHTML = '<div class="te-loading"><span>No KEV entries found for \u201C' + esc(vendor) + '\u201D</span></div>';
    return;
  }

  var statsHtml = '<div class="te-vuln-stats-row">' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value">' + (data.total_kev_entries || 0) + '</div><div class="te-vuln-stat-label">KEV Entries</div></div>' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value">' + (data.total_products_affected || 0) + '</div><div class="te-vuln-stat-label">Products Affected</div></div>' +
    '<div class="te-vuln-stat"><div class="te-vuln-stat-value" style="color:#ef4444">' + (data.total_ransomware_linked || 0) + '</div><div class="te-vuln-stat-label">Ransomware-Linked</div></div>' +
    '</div>';

  var products = data.products || [], maxCount = products.length ? products[0].kev_entries : 1;
  var tableHtml = '<div class="te-section-label"><span class="te-section-label-text">Product Exposure</span><span class="te-section-label-count">' + products.length + ' product' + (products.length !== 1 ? 's' : '') + '</span></div><div class="te-vendor-table">';
  for (var i = 0; i < products.length; i++) {
    var p = products[i], barW = Math.min(Math.round((p.kev_entries / maxCount) * 100), 100), hasRW = p.ransomware_linked > 0;
    tableHtml += '<div class="te-vendor-row"><span class="te-vendor-product">' + esc(p.product) + '</span><div class="te-epss-bar-wrap"><div class="te-epss-bar" style="width:' + barW + '%;background:' + (hasRW ? '#ef4444' : '#f97316') + '"></div></div><span class="te-vendor-count">' + p.kev_entries + '</span>' + (hasRW ? '<span class="te-kev-ransomware">' + p.ransomware_linked + '\u00A0RW</span>' : '<span class="te-vendor-norw"></span>') + '</div>';
  }
  tableHtml += '</div>';

  resultEl.innerHTML = statsHtml + tableHtml;
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
