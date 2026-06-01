/**
 * Card Engine — Interactive MCP Apps renderer for ChatGPT / Claude / MCPBundles.
 *
 * Supports the full MCP Apps bridge:
 *   - tools/call for in-card data refresh (e.g. click a stop → load arrivals)
 *   - ui/message for follow-up prompts (e.g. "Plan journey from here")
 *   - ui/requestDisplayMode for fullscreen map
 *   - ui/update-model-context for keeping the model in sync
 *   - Navigation stack within the iframe (host mirrors via Skybridge)
 *
 * Config (window.__APP_CONFIG__):
 *   engine:       "card"
 *   cards:        {toolCanonicalName: cardConfig, ...}
 *   mapDefaults:  {center: [lat,lon], zoom: 12, tileUrl, attribution}
 *   colorMaps:    {mapName: {key: "#hex", ...}, ...}
 *   slugMap:      {canonicalName: slug, ...}
 *   footerText:   "string"
 *   emptyState:   "string"
 *
 * Card config actions (per-row or card-level):
 *   actions[]: {label, type: "tool"|"message", tool, args, message, icon}
 *     type "tool": calls tools/call with resolved args, renders result as new card
 *     type "message": sends ui/message follow-up to the chat
 *
 * Section types: stats, meta, keyed-list, table, timeline, bar-meter
 */
(function() {
'use strict';

var cfg = window.__APP_CONFIG__ || {};
if (cfg.engine !== 'card') return;
window.__engineClaimed = true;

var CARDS = cfg.cards || {};
var MAP_DEFAULTS = cfg.mapDefaults || {
  center: [51.505, -0.09], zoom: 12,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
};
var FOOTER = cfg.footerText || '';
var SLUG_MAP = cfg.slugMap || {};
var COLOR_MAPS = cfg.colorMaps || {};

var _map = null;
var _mapEl = null;
var _mapLayers = [];
var _isFullscreen = false;
var _currentData = null;
var _currentCardCfg = null;
var _navStack = [];

// ── Slug resolution ──

function resolveSlug(canonicalName) {
  return SLUG_MAP[canonicalName] || canonicalName;
}

// ── Utilities ──

function esc(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

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

function interpolate(template, data) {
  if (!template) return '';
  return template.replace(/\{(\w[\w.]*)\}/g, function(m, key) {
    var val = resolveKey(data, key);
    return val !== null && val !== undefined ? String(val) : '';
  });
}

function formatValue(v, fmt) {
  if (v === null || v === undefined) return '\u2014';
  if (fmt === 'number') return typeof v === 'number' ? v.toLocaleString() : String(v);
  if (fmt === 'currency') return typeof v === 'number' ? '\u00a3' + v.toLocaleString() : String(v);
  if (fmt === 'percent') {
    if (typeof v === 'number') return (v * 100).toFixed(v === 0 || Math.abs(v) >= 0.1 ? 1 : 2) + '%';
    return String(v);
  }
  if (fmt === 'percent-round') return typeof v === 'number' ? Math.round(v * 100) + '%' : String(v);
  if (fmt === 'duration-seconds') {
    var m = Math.round(v / 60);
    if (m < 1) return 'Due';
    if (m === 1) return '1 min';
    return m + ' min';
  }
  if (fmt === 'duration-min') return v + ' min';
  if (fmt === 'time') {
    if (typeof v === 'string' && v.length >= 16) return v.substring(11, 16);
    return String(v);
  }
  if (fmt === 'join' && Array.isArray(v)) return v.join(', ');
  if (fmt === 'truncate-name') {
    var s = String(v);
    return s.replace(/^Santander Cycles:\s*/, '').replace(/, /, ' \u2014 ');
  }
  return String(v);
}

function lookupColor(mapName, key, fallback) {
  var map = COLOR_MAPS[mapName];
  if (!map || !key) return fallback || 'var(--text-muted)';
  var k = String(key).toLowerCase().replace(/\s+/g, '-');
  return map[k] || map[key] || fallback || 'var(--text-muted)';
}

// ── Navigation stack ──

function pushNav(title, data, cardCfg) {
  _navStack.push({title: title, data: _currentData, cardCfg: _currentCardCfg});
  _currentData = data;
  _currentCardCfg = cardCfg;
  renderCard(data, cardCfg);
  updateNavUI();
}

function popNav() {
  if (_navStack.length === 0) return;
  var prev = _navStack.pop();
  _currentData = prev.data;
  _currentCardCfg = prev.cardCfg;
  renderCard(prev.data, prev.cardCfg);
  updateNavUI();
}

function updateNavUI() {
  var backBtn = document.getElementById('ce-back-btn');
  if (_navStack.length > 0) {
    if (!backBtn) {
      var header = document.querySelector('.dashboard-header');
      if (header) {
        backBtn = document.createElement('button');
        backBtn.id = 'ce-back-btn';
        backBtn.className = 'ce-back-btn';
        backBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
        backBtn.addEventListener('click', popNav);
        header.insertBefore(backBtn, header.firstChild);
      }
    }
    if (backBtn) backBtn.style.display = '';
  } else {
    if (backBtn) backBtn.style.display = 'none';
  }
}

// ── Action handling ──

async function handleAction(action, rowData, cardData) {
  if (action.type === 'message') {
    var msg = interpolate(action.message, rowData || cardData);
    sendMessage(msg);
    return;
  }
  if (action.type === 'tool') {
    var toolSlug = resolveSlug(action.tool);
    var args = {};
    if (action.args) {
      for (var k in action.args) {
        args[k] = interpolate(String(action.args[k]), rowData || cardData);
      }
    }
    try {
      showInlineLoading();
      var result = await callTool(toolSlug, args);
      var data = extractData(result);
      if (data) {
        data._source_tool = action.tool;
        var targetCard = matchCard(action.tool);
        if (targetCard) {
          state.toolName = action.tool;
          pushNav(action.label || action.tool, data, targetCard);
        }
      }
    } catch (e) {
      showError(e.message || 'Action failed');
    }
  }
}

function showInlineLoading() {
  var content = document.querySelector('.dashboard-content');
  if (content) {
    content.innerHTML = '<div class="ce-loading"><div class="ce-loading-spinner"></div></div>';
  }
}

// ── Section: stats ──

function secStats(data, sec) {
  var items = sec.items || [];
  if (!items.length) return '';
  var html = '<div class="ce-stats">';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var val = resolveKey(data, it.key);
    if (it.compute === 'count') val = (resolveKey(data, it.key) || []).length;
    html += '<div class="ce-stat"><div class="ce-stat-value">' + esc(formatValue(val, it.format)) + '</div>' +
      '<div class="ce-stat-label">' + esc(it.label || '') + '</div></div>';
  }
  return html + '</div>';
}

// ── Section: meta (key-value pairs) ──

function secMeta(data, sec) {
  var items = sec.items || [];
  if (!items.length) return '';
  var html = '<div class="ce-meta">';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var val = resolveKey(data, it.key);
    if (val === null || val === undefined) continue;
    html += '<div class="ce-meta-row"><span class="ce-meta-label">' + esc(it.label || it.key) +
      '</span><span class="ce-meta-value">' + esc(formatValue(val, it.format)) + '</span></div>';
  }
  return html + '</div>';
}

// ── Section: keyed-list (rows with badge/dot color, fields, tags) ──

function secKeyedList(data, sec) {
  var items = resolveKey(data, sec.dataKey) || [];
  if (!items.length) return '<div class="ce-empty">' + esc(sec.emptyText || 'No data') + '</div>';
  var fields = sec.fields || [];
  var hasRowAction = sec.rowAction ? true : false;
  var html = '<div class="ce-kl">';
  for (var i = 0; i < Math.min(items.length, sec.maxItems || 100); i++) {
    var item = items[i];
    var badgeColor = null, badgeText = null;
    if (sec.badge) {
      var bk = resolveKey(item, sec.badge.colorKey);
      badgeColor = lookupColor(sec.badge.colorMap, bk, sec.badge.fallbackColor);
      badgeText = resolveKey(item, sec.badge.labelKey);
      if (!badgeText && typeof bk === 'string') badgeText = bk.substring(0, 3).toUpperCase();
    }
    var dotColor = null;
    if (sec.dot) {
      var dk = resolveKey(item, sec.dot.colorKey);
      dotColor = lookupColor(sec.dot.colorMap, dk, sec.dot.fallbackColor);
    }

    var rowCls = 'ce-kl-row' + (hasRowAction ? ' ce-kl-clickable' : '');
    html += '<div class="' + rowCls + '" data-row-idx="' + i + '">';
    if (sec.badge) {
      html += '<div class="ce-kl-badge" style="background:' + badgeColor + '">' + esc(badgeText || '') + '</div>';
    }
    if (sec.dot) {
      html += '<span class="ce-kl-dot" style="background:' + dotColor + '"></span>';
    }
    html += '<div class="ce-kl-body">';
    for (var f = 0; f < fields.length; f++) {
      var fd = fields[f];
      var val = resolveKey(item, fd.key);
      if (fd.nested) {
        var nested = val;
        if (Array.isArray(nested) && nested.length > 0) {
          val = resolveKey(nested[0], fd.nestedKey);
        }
      }
      var display = formatValue(val, fd.format);
      var cls = 'ce-kl-field ce-kl-' + (fd.style || 'secondary');
      if (fd.colorMap) {
        var colorLookup = val;
        if (fd.nested && fd.colorValueKey) {
          var nested2 = resolveKey(item, fd.key);
          if (Array.isArray(nested2) && nested2.length > 0) colorLookup = resolveKey(nested2[0], fd.colorValueKey);
        }
        var fc = lookupColor(fd.colorMap, colorLookup);
        cls += '" style="color:' + fc;
      }
      html += '<div class="' + cls + '">' + esc(display) + '</div>';
    }
    html += '</div>';

    if (sec.tags) {
      var tags = resolveKey(item, sec.tags.key) || [];
      if (Array.isArray(tags) && tags.length) {
        html += '<div class="ce-kl-tags">';
        for (var t = 0; t < tags.length; t++) {
          var tc = sec.tags.colorMap ? lookupColor(sec.tags.colorMap, tags[t]) : 'var(--text-muted)';
          html += '<span class="ce-kl-tag" style="background:' + tc + '">' + esc(String(tags[t])) + '</span>';
        }
        html += '</div>';
      }
    }

    if (hasRowAction) {
      html += '<svg class="ce-kl-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    }

    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Section: table (columnar with headers) ──

function secTable(data, sec) {
  var items = resolveKey(data, sec.dataKey) || [];
  if (!items.length) return '<div class="ce-empty">' + esc(sec.emptyText || 'No data') + '</div>';
  var cols = sec.columns || [];
  var html = '<table class="ce-table"><thead><tr>';
  for (var c = 0; c < cols.length; c++) {
    var align = cols[c].align === 'right' ? ' class="ce-right"' : '';
    html += '<th' + align + '>' + esc(cols[c].header || '') + '</th>';
  }
  html += '</tr></thead><tbody>';
  for (var i = 0; i < Math.min(items.length, sec.maxItems || 50); i++) {
    var item = items[i];
    html += '<tr>';
    for (var c2 = 0; c2 < cols.length; c2++) {
      var col = cols[c2];
      var val = resolveKey(item, col.key);
      if (col.nested) {
        var nested = val;
        if (Array.isArray(nested) && nested.length > 0) val = resolveKey(nested[0], col.nestedKey);
      }
      var display = formatValue(val, col.format);
      var cls = col.align === 'right' ? 'ce-right' : '';
      if (col.bold) cls += ' ce-bold';
      if (col.dot) {
        var dk = resolveKey(item, col.dot.colorKey);
        var dc = lookupColor(col.dot.colorMap, dk, col.dot.fallbackColor);
        display = '<span class="ce-kl-dot" style="background:' + dc + '"></span>' + esc(display);
        html += '<td class="' + cls + '">' + display + '</td>';
        continue;
      }
      var style = '';
      if (col.colorMap) {
        var fc = lookupColor(col.colorMap, val);
        style = ' style="color:' + fc + '"';
      }
      html += '<td class="' + cls + '"' + style + '>' + esc(display) + '</td>';
    }
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

// ── Section: timeline (nested group → legs with colored bars) ──

function secTimeline(data, sec) {
  var groups = resolveKey(data, sec.dataKey) || [];
  if (!groups.length) return '<div class="ce-empty">' + esc(sec.emptyText || 'No data') + '</div>';
  var html = '';
  for (var g = 0; g < Math.min(groups.length, sec.maxGroups || 3); g++) {
    var group = groups[g];
    var legs = resolveKey(group, sec.legsKey || 'legs') || [];
    html += '<div class="ce-tl-group">';
    if (sec.groupHeader) {
      var headerData = Object.assign({}, group);
      if (legs.length > 0) {
        headerData._origin = resolveKey(legs[0], 'departure_point') || '';
        headerData._destination = resolveKey(legs[legs.length - 1], 'arrival_point') || '';
      }
      var left = interpolate(sec.groupHeader.left || '', headerData);
      var right = interpolate(sec.groupHeader.right || '', headerData);
      html += '<div class="ce-tl-header">' +
        '<span class="ce-tl-header-left">' + esc(left) + '</span>' +
        '<span class="ce-tl-header-right">' + esc(right) + '</span></div>';
    }
    html += '<div class="ce-tl-legs">';
    for (var l = 0; l < legs.length; l++) {
      var leg = legs[l];
      var colorVal = resolveKey(leg, sec.colorKey || 'line');
      var barColor = sec.colorMapName ? lookupColor(sec.colorMapName, colorVal) : 'var(--accent)';
      html += '<div class="ce-tl-leg"><div class="ce-tl-bar" style="background:' + barColor + '"></div><div class="ce-tl-content">';
      if (sec.legFields) {
        for (var lf = 0; lf < sec.legFields.length; lf++) {
          var fd = sec.legFields[lf];
          if (fd.type === 'stop') {
            var timeVal = resolveKey(leg, fd.timeKey);
            var nameVal = resolveKey(leg, fd.nameKey);
            html += '<div class="ce-tl-stop"><span class="ce-tl-time">' + esc(formatValue(timeVal, 'time')) +
              '</span><span class="ce-tl-name">' + esc(nameVal || '') + '</span></div>';
          } else if (fd.type === 'mode') {
            var modeLabel = resolveKey(leg, fd.key) || resolveKey(leg, fd.fallbackKey) || '';
            var durVal = resolveKey(leg, fd.durationKey);
            html += '<div class="ce-tl-mode"><span class="ce-tl-pill" style="background:' + barColor + '">' +
              esc(modeLabel) + '</span>' +
              (durVal ? '<span class="ce-tl-dur">' + durVal + ' min</span>' : '') + '</div>';
          }
        }
      }
      html += '</div></div>';
    }
    html += '</div></div>';
  }
  return html;
}

// ── Section: bar-meter (name + progress bar + counts) ──

function secBarMeter(data, sec) {
  var items = resolveKey(data, sec.dataKey) || [];
  if (!items.length) return '<div class="ce-empty">' + esc(sec.emptyText || 'No data') + '</div>';
  var html = '<div class="ce-bm">';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var name = formatValue(resolveKey(item, sec.nameKey || 'name'), sec.nameFormat);
    var val = resolveKey(item, sec.valueKey) || 0;
    var max = resolveKey(item, sec.maxKey) || 1;
    var pct = max > 0 ? Math.round((val / max) * 100) : 0;
    var barColor = pct > 50 ? 'var(--success, #22c55e)' : pct > 20 ? '#eab308' : '#ef4444';

    var details = '';
    if (sec.detailFields) {
      for (var d = 0; d < sec.detailFields.length; d++) {
        var df = sec.detailFields[d];
        var dv = resolveKey(item, df.key);
        if (dv !== undefined && dv !== null) {
          details += '<span class="ce-bm-detail ' + (df.style || '') + '">' + dv + (df.suffix || '') + '</span>';
        }
      }
    }

    html += '<div class="ce-bm-row"><div class="ce-bm-info"><div class="ce-bm-name">' + esc(name) + '</div>' +
      '<div class="ce-bm-bar-wrap"><div class="ce-bm-bar" style="width:' + pct + '%;background:' + barColor + '"></div></div></div>' +
      '<div class="ce-bm-counts">' + details + '<span class="ce-bm-val">' + val + '</span>' +
      '<span class="ce-bm-slash">/</span><span class="ce-bm-max">' + max + '</span></div></div>';
  }
  return html + '</div>';
}

var CE_RENDERERS = {
  'stats': secStats,
  'meta': secMeta,
  'keyed-list': secKeyedList,
  'table': secTable,
  'timeline': secTimeline,
  'bar-meter': secBarMeter,
};

function renderSections(data, sections) {
  var html = '';
  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var fn = CE_RENDERERS[sec.type];
    if (fn) html += fn(data, sec);
  }
  return html;
}

// ── Map rendering (Leaflet) ──

function ensureLeafletLoaded() {
  return new Promise(function(resolve) {
    if (window.L) { resolve(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

function clearMapLayers() {
  if (!_map) return;
  for (var i = 0; i < _mapLayers.length; i++) _map.removeLayer(_mapLayers[i]);
  _mapLayers = [];
}

async function renderMap(container, data, mapCfg) {
  await ensureLeafletLoaded();
  var L = window.L;

  if (!_map) {
    _mapEl = container;
    _map = L.map(container, { zoomControl: true, attributionControl: true });
    L.tileLayer(MAP_DEFAULTS.tileUrl, { attribution: MAP_DEFAULTS.attribution, maxZoom: 18 }).addTo(_map);

    // The host iframe starts at 0 height in both ChatGPT and Claude. Without
    // a ResizeObserver, Leaflet caches that 0×0 container size at L.map()
    // time and never requests tiles or lays out polylines, even after the
    // iframe later expands. The trailing setTimeout(invalidateSize, 100)
    // below covers the first render only — the observer covers every
    // subsequent host-driven resize (fullscreen punch-out, manual browser
    // resize, switching between card detail views).
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function() {
        if (_map) _map.invalidateSize(false);
      });
      ro.observe(container);
    } else {
      window.addEventListener('resize', function() {
        if (_map) _map.invalidateSize(false);
      });
    }
  }

  clearMapLayers();
  // `new L.LatLngBounds()` is the constructor form. The factory `L.latLngBounds()`
  // (lowercase, no `new`) requires at least one arg and throws
  // `Cannot read properties of undefined (reading 'latLngBounds')` on Leaflet
  // 1.9.4 when called with no args — same crash that broke the TFL map engine.
  var bounds = new L.LatLngBounds();
  var hasBounds = false;
  var items = resolveKey(data, mapCfg.dataKey) || [];

  if (mapCfg.type === 'polyline') {
    var groups = items;
    for (var g = 0; g < Math.min(groups.length, 1); g++) {
      var legs = resolveKey(groups[g], mapCfg.legsKey || 'legs') || [];
      for (var l = 0; l < legs.length; l++) {
        var leg = legs[l];
        var depLat = resolveKey(leg, mapCfg.depLatKey || 'dep_lat');
        var depLon = resolveKey(leg, mapCfg.depLonKey || 'dep_lon');
        var arrLat = resolveKey(leg, mapCfg.arrLatKey || 'arr_lat');
        var arrLon = resolveKey(leg, mapCfg.arrLonKey || 'arr_lon');
        var colorVal = resolveKey(leg, mapCfg.colorKey || 'line');
        var lc = mapCfg.colorMapName ? lookupColor(mapCfg.colorMapName, colorVal, '#3b82f6') : '#3b82f6';
        var popupLabel = resolveKey(leg, mapCfg.labelKey || 'departure_point') || '';

        if (depLat && depLon) {
          var depPt = [depLat, depLon];
          bounds.extend(depPt); hasBounds = true;
          var dm = L.circleMarker(depPt, {radius: 7, fillColor: lc, color: '#fff', weight: 2, fillOpacity: 1});
          dm.bindPopup('<b>' + esc(popupLabel) + '</b>');
          dm.addTo(_map); _mapLayers.push(dm);
        }
        if (arrLat && arrLon) {
          bounds.extend([arrLat, arrLon]); hasBounds = true;
        }
        if (depLat && depLon && arrLat && arrLon) {
          var poly = L.polyline([[depLat, depLon], [arrLat, arrLon]], {color: lc, weight: 4, opacity: 0.8});
          poly.addTo(_map); _mapLayers.push(poly);
        }
      }
      if (legs.length > 0) {
        var last = legs[legs.length - 1];
        var lLat = resolveKey(last, mapCfg.arrLatKey || 'arr_lat');
        var lLon = resolveKey(last, mapCfg.arrLonKey || 'arr_lon');
        if (lLat && lLon) {
          var lm = L.circleMarker([lLat, lLon], {radius: 7, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1});
          lm.bindPopup('<b>' + esc(resolveKey(last, mapCfg.endLabelKey || 'arrival_point') || 'Destination') + '</b>');
          lm.addTo(_map); _mapLayers.push(lm);
        }
      }
    }
  } else {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var lat = resolveKey(item, mapCfg.latKey || 'lat');
      var lon = resolveKey(item, mapCfg.lonKey || 'lon');
      if (!lat || !lon) continue;
      var pt = [lat, lon];
      bounds.extend(pt); hasBounds = true;
      var label = resolveKey(item, mapCfg.labelKey || 'name') || '';
      var popupParts = ['<b>' + esc(label) + '</b>'];
      if (mapCfg.popupFields) {
        for (var p = 0; p < mapCfg.popupFields.length; p++) {
          var pf = mapCfg.popupFields[p];
          var pv = resolveKey(item, pf.key);
          if (pv !== undefined && pv !== null) popupParts.push(esc(pf.label || pf.key) + ': ' + esc(String(pv)));
        }
      }
      var mk = L.marker(pt);
      mk.bindPopup(popupParts.join('<br>'));
      mk.addTo(_map); _mapLayers.push(mk);
    }
  }

  if (hasBounds) _map.fitBounds(bounds, {padding: [30, 30], maxZoom: 14});
  else _map.setView(MAP_DEFAULTS.center, MAP_DEFAULTS.zoom);
  setTimeout(function() { _map.invalidateSize(); }, 100);
}

// ── Card matching ──

function matchCard(toolName) {
  if (CARDS[toolName]) return CARDS[toolName];
  for (var key in CARDS) {
    if (toolName && toolName.indexOf(key.replace(/_/g, '-')) !== -1) return CARDS[key];
    if (toolName && toolName.replace(/-/g, '_').indexOf(key) !== -1) return CARDS[key];
  }
  return null;
}

// ── Card-level actions bar ──

function renderActions(actions, rowData, cardData) {
  if (!actions || !actions.length) return '';
  var html = '<div class="ce-actions">';
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    var label = interpolate(a.label || '', rowData || cardData);
    var cls = a.primary ? 'ce-action-btn ce-action-primary' : 'ce-action-btn';
    html += '<button class="' + cls + '" data-action-idx="' + i + '">' + esc(label) + '</button>';
  }
  return html + '</div>';
}

// ── Card rendering ──

function renderCard(data, cardCfgOverride) {
  var toolName = data._source_tool || data._forwardedFrom || state.toolName || '';
  var cardCfg = cardCfgOverride || matchCard(toolName);
  if (!cardCfg) return;
  _currentData = data; _currentCardCfg = cardCfg;

  var titleEl = document.getElementById('dashboard-title');
  var subtitleEl = document.getElementById('dashboard-subtitle');
  if (titleEl && cardCfg.title) titleEl.textContent = interpolate(cardCfg.title, data);
  if (subtitleEl && cardCfg.subtitle) subtitleEl.textContent = interpolate(cardCfg.subtitle, data);
  else if (subtitleEl) subtitleEl.textContent = '';

  var content = document.querySelector('.dashboard-content');
  if (!content) return;

  var html = '';
  if (cardCfg.sections) html += renderSections(data, cardCfg.sections);
  if (cardCfg.actions) html += renderActions(cardCfg.actions, null, data);
  if (cardCfg.map && !_isFullscreen) html += '<div id="ce-map-inline" class="ce-map-inline"></div>';
  if (cardCfg.map && cardCfg.map.expandable !== false && canGoFullscreen()) {
    html += '<div class="ce-expand-row"><button class="ce-expand-btn" id="ce-expand-btn">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>' +
      ' View on map</button></div>';
  }
  if (FOOTER && !_isFullscreen) html += '<div class="ce-footer">' + esc(FOOTER) + '</div>';
  content.innerHTML = html;

  // Wire up row click actions
  if (cardCfg.sections) {
    cardCfg.sections.forEach(function(sec) {
      if (sec.rowAction) {
        var rows = content.querySelectorAll('.ce-kl-row[data-row-idx]');
        var items = resolveKey(data, sec.dataKey) || [];
        rows.forEach(function(row) {
          row.addEventListener('click', function() {
            var idx = parseInt(row.getAttribute('data-row-idx'), 10);
            var item = items[idx];
            if (item) handleAction(sec.rowAction, item, data);
          });
        });
      }
    });
  }

  // Wire up card-level action buttons
  if (cardCfg.actions) {
    var btns = content.querySelectorAll('.ce-action-btn[data-action-idx]');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-action-idx'), 10);
        var action = cardCfg.actions[idx];
        if (action) handleAction(action, null, data);
      });
    });
  }

  if (cardCfg.map && !_isFullscreen) {
    var mapEl = document.getElementById('ce-map-inline');
    if (mapEl) renderMap(mapEl, data, cardCfg.map);
  }
  var expandBtn = document.getElementById('ce-expand-btn');
  if (expandBtn) expandBtn.addEventListener('click', function() { goFullscreen(); });
  if (cardCfg.modelContext) updateModelContext(interpolate(cardCfg.modelContext, data));
}

async function goFullscreen() {
  if (!_currentCardCfg || !_currentCardCfg.map || !_currentData) return;
  _isFullscreen = true; _map = null;
  await requestDisplayMode('fullscreen');
  var content = document.querySelector('.dashboard-content');
  if (!content) return;
  content.innerHTML = '<div id="ce-map-fullscreen" class="ce-map-fullscreen"></div>';
  var header = document.querySelector('.dashboard-header');
  if (header) header.style.display = 'none';
  var mapEl = document.getElementById('ce-map-fullscreen');
  if (mapEl) await renderMap(mapEl, _currentData, _currentCardCfg.map);
}

// ── Wire up ──

renderDashboard = function(data) {
  _autoLoadFired = true;
  var toolName = data._source_tool || data._forwardedFrom || state.toolName || '';
  if (_isFullscreen && _map) {
    var cardCfg = matchCard(toolName);
    if (cardCfg && cardCfg.map) {
      _currentData = data; _currentCardCfg = cardCfg;
      renderMap(_mapEl || document.getElementById('ce-map-fullscreen'), data, cardCfg.map);
      return;
    }
  }
  _navStack = [];
  updateNavUI();
  renderCard(data);
};

var AUTO_LOAD_TOOL = cfg.autoLoadTool || null;
var _autoLoadFired = false;

function _showEmptyState() {
  var content = document.querySelector('.dashboard-content');
  if (content) {
    var desc = cfg.emptyState || 'Ask a question to get started.';
    content.innerHTML = '<div class="ce-empty-state"><p class="ce-empty-state-text">' + esc(desc) + '</p>' +
      (FOOTER ? '<div class="ce-footer">' + esc(FOOTER) + '</div>' : '') + '</div>';
  }
}

function _waitForMCP(maxMs) {
  return new Promise(function(resolve) {
    if (state.mcpInitialized) { resolve(true); return; }
    var elapsed = 0;
    var interval = 50;
    var timer = setInterval(function() {
      elapsed += interval;
      if (state.mcpInitialized || _autoLoadFired) {
        clearInterval(timer);
        resolve(state.mcpInitialized);
      } else if (elapsed >= maxMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

var _AUTO_LOAD_GRACE_MS = 600;

async function _autoLoad() {
  if (_autoLoadFired || !AUTO_LOAD_TOOL) return;

  var ready = await _waitForMCP(15000);
  if (_autoLoadFired) return;
  if (!ready) { _showEmptyState(); return; }

  await new Promise(function(r) { setTimeout(r, _AUTO_LOAD_GRACE_MS); });
  if (_autoLoadFired) return;

  _autoLoadFired = true;
  var slug = resolveSlug(AUTO_LOAD_TOOL);
  try {
    showInlineLoading();
    var result = await callTool(slug, {});
    var data = extractData(result);
    if (data) {
      data._source_tool = AUTO_LOAD_TOOL;
      renderCard(data);
    } else {
      _showEmptyState();
    }
  } catch (e) {
    _showEmptyState();
  }
}

if (window.__QUEUED_DATA__) {
  var queued = window.__QUEUED_DATA__; delete window.__QUEUED_DATA__;
  _autoLoadFired = true;
  renderCard(queued);
} else if (AUTO_LOAD_TOOL) {
  showInlineLoading();
  _autoLoad();
} else {
  _showEmptyState();
}

window.addEventListener('message', function(event) {
  var msg = event.data;
  if (!msg || msg.jsonrpc !== '2.0') return;
  if (msg.method === 'ui/notifications/host-context-changed' && msg.params && msg.params.displayMode) {
    if (msg.params.displayMode !== 'fullscreen' && _isFullscreen) {
      _isFullscreen = false; _map = null;
      var header = document.querySelector('.dashboard-header');
      if (header) header.style.display = '';
      if (_currentData) renderCard(_currentData);
    }
  }
});

})();
