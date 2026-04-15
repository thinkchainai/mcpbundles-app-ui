/**
 * Map Engine — Full-bleed interactive map MCP App renderer.
 *
 * The map occupies 100% of the viewport. Data is shown as map layers
 * (polylines, markers, circles) plus floating overlay panels.
 *
 * Config (window.__APP_CONFIG__):
 *   engine:       "map"
 *   mapDefaults:  {center, zoom, tileUrl, attribution, darkTileUrl}
 *   colorMaps:    {mapName: {key: "#hex"}}
 *   layers:       {toolCanonicalName: layerConfig}
 *   slugMap:      {canonicalName: slug}
 *   emptyState:   "string"
 *   autoLoadTool: "canonicalToolName"
 *   statusBar:    {position: "bottom-left"}
 *
 * Layer config:
 *   type: "line-status" | "markers" | "polyline" | "arrivals" | "journey"
 *   title: "string" (floating panel title)
 *   ... type-specific fields
 */
(function() {
'use strict';

var cfg = window.__APP_CONFIG__ || {};
if (cfg.engine !== 'map') return;
window.__engineClaimed = true;

var LAYERS = cfg.layers || {};
var MAP_DEFAULTS = cfg.mapDefaults || {
  center: [51.505, -0.09], zoom: 12,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
};
var SLUG_MAP = cfg.slugMap || {};
var COLOR_MAPS = cfg.colorMaps || {};

var _map = null;
var _mapLayers = [];
var _currentData = null;
var _currentLayerCfg = null;
var _currentToolName = null;
var _autoLoadFired = false;

function resolveSlug(name) { return SLUG_MAP[name] || name; }
function esc(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function lookupColor(mapName, key, fallback) {
  var map = COLOR_MAPS[mapName];
  if (!map || !key) return fallback || '#6b7280';
  var k = String(key).toLowerCase().replace(/\s+/g, '-');
  return map[k] || map[key] || fallback || '#6b7280';
}

function formatDuration(secs) {
  if (secs === null || secs === undefined) return '\u2014';
  var m = Math.round(secs / 60);
  if (m < 1) return 'Due';
  if (m === 1) return '1 min';
  return m + ' min';
}

function formatTime(v) {
  if (typeof v === 'string' && v.length >= 16) return v.substring(11, 16);
  return String(v || '');
}

// ── Map initialization ──

function ensureLeafletLoaded() {
  return new Promise(function(resolve, reject) {
    if (window.L) { resolve(); return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    var script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = function() { resolve(); };
    script.onerror = function() { reject(new Error('Leaflet load failed')); };
    document.head.appendChild(script);
  });
}

async function initMap() {
  await ensureLeafletLoaded();
  var L = window.L;
  var container = document.getElementById('me-map');
  if (!container || _map) return;

  _map = L.map(container, {
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'topright' }).addTo(_map);

  L.tileLayer(MAP_DEFAULTS.tileUrl, {
    attribution: MAP_DEFAULTS.attribution,
    maxZoom: 18,
    subdomains: MAP_DEFAULTS.subdomains || 'abcd'
  }).addTo(_map);

  _map.setView(MAP_DEFAULTS.center, MAP_DEFAULTS.zoom);
}

function clearLayers() {
  if (!_map) return;
  for (var i = 0; i < _mapLayers.length; i++) _map.removeLayer(_mapLayers[i]);
  _mapLayers = [];
}

// ── Floating panel ──

function showPanel(html, position) {
  var panel = document.getElementById('me-panel');
  if (!panel) return;
  panel.innerHTML = html;
  panel.classList.add('me-panel-visible');
  panel.className = 'me-panel me-panel-visible me-panel-' + (position || 'bottom-left');
}

function hidePanel() {
  var panel = document.getElementById('me-panel');
  if (panel) {
    panel.classList.remove('me-panel-visible');
    panel.innerHTML = '';
  }
}

function showStatusBar(html) {
  var bar = document.getElementById('me-status');
  if (!bar) return;
  bar.innerHTML = html;
  bar.classList.add('me-status-visible');
}

function hideStatusBar() {
  var bar = document.getElementById('me-status');
  if (bar) {
    bar.classList.remove('me-status-visible');
    bar.innerHTML = '';
  }
}

// ── Layer: line-status (tube status overview) ──

function renderLineStatus(data, layerCfg) {
  var L = window.L;
  var lines = data.lines || [];
  if (!lines.length) return;

  var statusHtml = '<div class="me-line-grid">';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var color = lookupColor('lines', line.id, '#666');
    var statusText = 'Unknown';
    var statusClass = 'me-ls-ok';
    if (line.statuses && line.statuses.length > 0) {
      statusText = line.statuses[0].description || 'Unknown';
      var sev = line.statuses[0].severity;
      if (sev === 10) statusClass = 'me-ls-ok';
      else if (sev >= 9) statusClass = 'me-ls-minor';
      else if (sev >= 5) statusClass = 'me-ls-severe';
      else statusClass = 'me-ls-closed';
    }
    statusHtml += '<div class="me-line-row" data-line-id="' + esc(line.id) + '">' +
      '<span class="me-line-dot" style="background:' + color + '"></span>' +
      '<span class="me-line-name">' + esc(line.name) + '</span>' +
      '<span class="me-line-status ' + statusClass + '">' + esc(statusText) + '</span>' +
      '</div>';
  }
  statusHtml += '</div>';

  showPanel(
    '<div class="me-panel-header">' +
      '<span class="me-panel-title">' + esc(layerCfg.title || 'Line Status') + '</span>' +
      '<span class="me-panel-badge">' + lines.length + ' lines</span>' +
    '</div>' + statusHtml,
    'bottom-left'
  );

  var panel = document.getElementById('me-panel');
  if (panel) {
    panel.querySelectorAll('.me-line-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var lineId = row.getAttribute('data-line-id');
        if (lineId) {
          var slug = resolveSlug('tfl_line_arrivals');
          showInlineLoading();
          callTool(slug, { line_id: lineId }).then(function(result) {
            var d = extractData(result);
            if (d) {
              d._source_tool = 'tfl_line_arrivals';
              renderDashboard(d);
            }
          }).catch(function() {});
        }
      });
    });
  }

  // Show disrupted lines on status bar
  var disrupted = lines.filter(function(l) {
    return l.statuses && l.statuses.length > 0 && l.statuses[0].severity < 10;
  });
  if (disrupted.length > 0) {
    var barHtml = '<span class="me-sb-icon">\u26A0</span>';
    barHtml += '<span class="me-sb-text">' + disrupted.length + ' line' + (disrupted.length > 1 ? 's' : '') + ' disrupted</span>';
    showStatusBar(barHtml);
  } else {
    showStatusBar('<span class="me-sb-icon">\u2713</span><span class="me-sb-text">Good service on all lines</span>');
  }

  // If route data is embedded, draw the lines on the map
  if (data._routes) {
    _drawRouteLines(data._routes, lines);
  }
}

function _drawRouteLines(routes, lines) {
  var L = window.L;
  var bounds = L.latLngBounds();
  var hasBounds = false;

  for (var lineId in routes) {
    var coords = routes[lineId];
    if (!coords || coords.length < 2) continue;
    var color = lookupColor('lines', lineId, '#666');

    var latLngs = coords.map(function(c) { return [c[0], c[1]]; });
    var poly = L.polyline(latLngs, {
      color: color,
      weight: 4,
      opacity: 0.7,
      lineJoin: 'round'
    });
    poly.addTo(_map);
    _mapLayers.push(poly);

    for (var j = 0; j < latLngs.length; j++) {
      bounds.extend(latLngs[j]);
      hasBounds = true;
    }
  }

  if (hasBounds) {
    _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

// ── Layer: markers (bike points, search results) ──

function renderMarkers(data, layerCfg) {
  var L = window.L;
  var items = data[layerCfg.dataKey || 'stations'] || data[layerCfg.dataKey || 'matches'] || [];
  if (!items.length) {
    showPanel('<div class="me-panel-header"><span class="me-panel-title">No results</span></div><div class="me-empty">No locations found.</div>', 'bottom-left');
    return;
  }

  var bounds = L.latLngBounds();
  var hasBounds = false;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var lat = item[layerCfg.latKey || 'lat'];
    var lon = item[layerCfg.lonKey || 'lon'];
    if (!lat || !lon) continue;

    var pt = [lat, lon];
    bounds.extend(pt);
    hasBounds = true;

    var label = item[layerCfg.labelKey || 'name'] || '';
    var popupParts = ['<b>' + esc(label) + '</b>'];
    if (layerCfg.popupFields) {
      for (var p = 0; p < layerCfg.popupFields.length; p++) {
        var pf = layerCfg.popupFields[p];
        var pv = item[pf.key];
        if (pv !== undefined && pv !== null) {
          popupParts.push(esc(pf.label || pf.key) + ': <b>' + esc(String(pv)) + '</b>');
        }
      }
    }

    var markerColor = layerCfg.markerColor || 'var(--accent)';
    if (layerCfg.colorFn === 'bike-availability') {
      var bikes = item.bikes_available || 0;
      var total = item.total_docks || 1;
      var pct = (bikes / total) * 100;
      markerColor = pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
    }

    var cm = L.circleMarker(pt, {
      radius: layerCfg.radius || 7,
      fillColor: markerColor,
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    });
    cm.bindPopup(popupParts.join('<br>'));

    if (layerCfg.clickAction) {
      (function(itm) {
        cm.on('click', function() {
          _handleMarkerClick(itm, layerCfg.clickAction);
        });
      })(item);
    }

    cm.addTo(_map);
    _mapLayers.push(cm);
  }

  if (hasBounds) _map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });

  // Build panel list
  var panelHtml = '<div class="me-panel-header">' +
    '<span class="me-panel-title">' + esc(layerCfg.title || 'Results') + '</span>' +
    '<span class="me-panel-badge">' + items.length + '</span>' +
  '</div><div class="me-marker-list">';

  for (var j = 0; j < Math.min(items.length, 15); j++) {
    var it = items[j];
    var nameVal = it[layerCfg.labelKey || 'name'] || '';
    panelHtml += '<div class="me-marker-item">';
    panelHtml += '<span class="me-marker-name">' + esc(nameVal) + '</span>';
    if (layerCfg.detailFields) {
      for (var d = 0; d < layerCfg.detailFields.length; d++) {
        var df = layerCfg.detailFields[d];
        var dv = it[df.key];
        if (dv !== undefined && dv !== null) {
          panelHtml += '<span class="me-marker-detail">' + esc(df.label || '') + ' ' + esc(String(dv)) + '</span>';
        }
      }
    }
    panelHtml += '</div>';
  }
  panelHtml += '</div>';
  showPanel(panelHtml, 'bottom-left');

  showStatusBar(
    '<span class="me-sb-text">' + items.length + ' ' + esc(layerCfg.itemLabel || 'locations') + ' found</span>'
  );
}

function _handleMarkerClick(item, clickAction) {
  if (clickAction.type === 'tool') {
    var args = {};
    for (var k in clickAction.args) {
      var tmpl = clickAction.args[k];
      args[k] = String(tmpl).replace(/\{(\w+)\}/g, function(m, key) {
        return item[key] !== undefined ? String(item[key]) : m;
      });
    }
    var slug = resolveSlug(clickAction.tool);
    showInlineLoading();
    callTool(slug, args).then(function(result) {
      var d = extractData(result);
      if (d) {
        d._source_tool = clickAction.tool;
        renderDashboard(d);
      }
    }).catch(function() {});
  } else if (clickAction.type === 'message') {
    var msg = String(clickAction.message || '').replace(/\{(\w+)\}/g, function(m, key) {
      return item[key] !== undefined ? String(item[key]) : m;
    });
    sendMessage(msg);
  }
}

// ── Layer: arrivals (arrival board overlay) ──

function renderArrivals(data, layerCfg) {
  var arrivals = data.arrivals || [];
  var title = layerCfg.title || 'Live Arrivals';
  var subtitle = '';
  if (data.line) subtitle = data.line;
  else if (data.stop_id) subtitle = data.stop_id;

  if (!arrivals.length) {
    showPanel(
      '<div class="me-panel-header"><span class="me-panel-title">' + esc(title) + '</span></div>' +
      '<div class="me-empty">No arrivals predicted right now.</div>',
      'bottom-left'
    );
    return;
  }

  var html = '<div class="me-panel-header">' +
    '<span class="me-panel-title">' + esc(title) + '</span>' +
    '<span class="me-panel-badge">' + arrivals.length + '</span>' +
  '</div>';

  html += '<div class="me-arrivals-board">';
  for (var i = 0; i < Math.min(arrivals.length, 12); i++) {
    var arr = arrivals[i];
    var lineColor = lookupColor('lines', (arr.line || '').toLowerCase().replace(/\s+/g, '-'), '#666');
    var due = formatDuration(arr.time_to_station_seconds);
    html += '<div class="me-arr-row">' +
      '<span class="me-arr-dot" style="background:' + lineColor + '"></span>' +
      '<span class="me-arr-dest">' + esc(arr.destination || arr.station || '') + '</span>' +
      '<span class="me-arr-due ' + (due === 'Due' ? 'me-arr-now' : '') + '">' + esc(due) + '</span>' +
    '</div>';
  }
  html += '</div>';

  // Refresh button
  if (data.stop_id || data.line) {
    html += '<div class="me-panel-actions">';
    html += '<button class="me-panel-btn" id="me-refresh-arrivals">\u21BB Refresh</button>';
    html += '</div>';
  }

  showPanel(html, 'bottom-left');

  var refreshBtn = document.getElementById('me-refresh-arrivals');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      var tool = data.line ? 'tfl_line_arrivals' : 'tfl_stop_arrivals';
      var args = data.line ? { line_id: data.line } : { stop_id: data.stop_id };
      var slug = resolveSlug(tool);
      refreshBtn.disabled = true;
      refreshBtn.textContent = '\u21BB Refreshing...';
      callTool(slug, args).then(function(result) {
        var d = extractData(result);
        if (d) {
          d._source_tool = tool;
          renderDashboard(d);
        }
      }).catch(function() {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '\u21BB Refresh';
      });
    });
  }

  showStatusBar(
    '<span class="me-sb-text">' + arrivals.length + ' arrival' + (arrivals.length > 1 ? 's' : '') + ' predicted</span>'
  );
}

// ── Layer: journey (polyline route with stops) ──

function renderJourney(data, layerCfg) {
  var L = window.L;
  var journeys = data.journeys || [];
  if (!journeys.length) {
    showPanel(
      '<div class="me-panel-header"><span class="me-panel-title">No routes found</span></div>' +
      '<div class="me-empty">No journey options available.</div>',
      'bottom-left'
    );
    return;
  }

  var bounds = L.latLngBounds();
  var hasBounds = false;

  // Draw the first journey on the map
  var journey = journeys[0];
  var legs = journey.legs || [];

  for (var l = 0; l < legs.length; l++) {
    var leg = legs[l];
    var depLat = leg.dep_lat, depLon = leg.dep_lon;
    var arrLat = leg.arr_lat, arrLon = leg.arr_lon;
    var lineColor = lookupColor('lines', (leg.line || '').toLowerCase(), '#3b82f6');

    if (depLat && depLon) {
      var depPt = [depLat, depLon];
      bounds.extend(depPt); hasBounds = true;
      var dm = L.circleMarker(depPt, { radius: 8, fillColor: lineColor, color: '#fff', weight: 3, fillOpacity: 1 });
      dm.bindPopup('<b>' + esc(leg.departure_point || '') + '</b>');
      dm.addTo(_map); _mapLayers.push(dm);
    }
    if (arrLat && arrLon) {
      bounds.extend([arrLat, arrLon]); hasBounds = true;
    }
    if (depLat && depLon && arrLat && arrLon) {
      var poly = L.polyline([[depLat, depLon], [arrLat, arrLon]], {
        color: lineColor, weight: 5, opacity: 0.8,
        dashArray: leg.mode === 'walking' ? '8 8' : null
      });
      poly.addTo(_map); _mapLayers.push(poly);
    }
  }

  // Last stop marker
  if (legs.length > 0) {
    var last = legs[legs.length - 1];
    if (last.arr_lat && last.arr_lon) {
      var lm = L.circleMarker([last.arr_lat, last.arr_lon], { radius: 8, fillColor: '#ef4444', color: '#fff', weight: 3, fillOpacity: 1 });
      lm.bindPopup('<b>' + esc(last.arrival_point || 'Destination') + '</b>');
      lm.addTo(_map); _mapLayers.push(lm);
    }
  }

  if (hasBounds) _map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });

  // Build journey panel
  var panelHtml = '<div class="me-panel-header">' +
    '<span class="me-panel-title">Journey</span>' +
    '<span class="me-panel-badge">' + (journey.duration || '?') + ' min</span>' +
  '</div>';

  panelHtml += '<div class="me-journey-legs">';
  for (var j = 0; j < legs.length; j++) {
    var jleg = legs[j];
    var jColor = lookupColor('lines', (jleg.line || '').toLowerCase(), '#3b82f6');
    panelHtml += '<div class="me-jleg">' +
      '<div class="me-jleg-bar" style="background:' + jColor + '"></div>' +
      '<div class="me-jleg-info">' +
        '<div class="me-jleg-stop">' + esc(formatTime(jleg.departure_time)) + ' ' + esc(jleg.departure_point || '') + '</div>' +
        '<div class="me-jleg-line"><span class="me-jleg-pill" style="background:' + jColor + '">' + esc(jleg.line || jleg.mode || '') + '</span>' +
        (jleg.duration ? '<span class="me-jleg-dur">' + jleg.duration + ' min</span>' : '') + '</div>' +
        '<div class="me-jleg-stop">' + esc(formatTime(jleg.arrival_time)) + ' ' + esc(jleg.arrival_point || '') + '</div>' +
      '</div></div>';
  }
  panelHtml += '</div>';

  if (journeys.length > 1) {
    panelHtml += '<div class="me-journey-alt">' + (journeys.length - 1) + ' alternative route' + (journeys.length > 2 ? 's' : '') + ' available</div>';
  }

  showPanel(panelHtml, 'bottom-left');

  showStatusBar(
    '<span class="me-sb-text">' + esc(legs.length > 0 ? (legs[0].departure_point || '') : '') +
    ' \u2192 ' + esc(legs.length > 0 ? (legs[legs.length - 1].arrival_point || '') : '') +
    ' \u00B7 ' + (journey.duration || '?') + ' min</span>'
  );
}

// ── Layer matching ──

function matchLayer(toolName) {
  if (LAYERS[toolName]) return LAYERS[toolName];
  for (var key in LAYERS) {
    if (toolName && toolName.indexOf(key.replace(/_/g, '-')) !== -1) return LAYERS[key];
    if (toolName && toolName.replace(/-/g, '_').indexOf(key) !== -1) return LAYERS[key];
  }
  return null;
}

var ME_RENDERERS = {
  'line-status': renderLineStatus,
  'markers': renderMarkers,
  'arrivals': renderArrivals,
  'journey': renderJourney
};

// ── Loading states ──

function showInlineLoading() {
  showPanel(
    '<div class="me-panel-loading"><div class="me-loading-spinner"></div><span>Loading...</span></div>',
    'bottom-left'
  );
}

function showEmptyState() {
  var desc = cfg.emptyState || 'Ask about transport to see it on the map.';
  showPanel(
    '<div class="me-panel-header"><span class="me-panel-title">' + esc(cfg.name || 'Map') + '</span></div>' +
    '<div class="me-empty-state">' + esc(desc) + '</div>',
    'bottom-left'
  );
}

// ── Main render ──

renderDashboard = function(data) {
  try {
  if (typeof window.__checkGate === 'function' && window.__checkGate(data)) {
    return;
  }
  _autoLoadFired = true;
  var toolName = data._source_tool || state.toolName || '';
  _currentToolName = toolName;

  var layerCfg = matchLayer(toolName);
  if (!layerCfg) {
    showPanel(
      '<div class="me-panel-header"><span class="me-panel-title">Data received</span></div>' +
      '<div class="me-empty">No map layer configured for this tool.</div>',
      'bottom-left'
    );
    return;
  }

  clearLayers();
  _currentData = data;
  _currentLayerCfg = layerCfg;

  var renderer = ME_RENDERERS[layerCfg.type];
  if (renderer) {
    renderer(data, layerCfg);
  }

  if (layerCfg.modelContext) {
    updateModelContext(layerCfg.modelContext);
  }
  } catch (e) {
    console.error('[MapEngine] renderDashboard CRASHED:', e, e.stack || '');
    showPanel(
      '<div class="me-panel-header"><span class="me-panel-title">Error</span></div>' +
      '<div class="me-empty">' + esc(e.message || 'Rendering failed') + '</div>',
      'bottom-left'
    );
  }
};

// ── Auto-load ──

var AUTO_LOAD_TOOL = cfg.autoLoadTool || null;

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

async function _autoLoad() {
  if (_autoLoadFired || !AUTO_LOAD_TOOL) return;

  var ready = await _waitForMCP(15000);
  if (_autoLoadFired) return;
  if (!ready) { showEmptyState(); return; }

  await new Promise(function(r) { setTimeout(r, 600); });
  if (_autoLoadFired) return;

  _autoLoadFired = true;
  var slug = resolveSlug(AUTO_LOAD_TOOL);
  try {
    showInlineLoading();
    var result = await callTool(slug, {});
    var data = extractData(result);
    if (data) {
      if (typeof window.__checkGate === 'function' && window.__checkGate(data)) {
        return;
      }
      data._source_tool = AUTO_LOAD_TOOL;
      renderDashboard(data);
    } else {
      showEmptyState();
    }
  } catch (e) {
    showEmptyState();
  }
}

// ── Init ──

async function _init() {
  await initMap();

  if (window.__QUEUED_DATA__) {
    var queued = window.__QUEUED_DATA__;
    delete window.__QUEUED_DATA__;
    _autoLoadFired = true;
    renderDashboard(queued);
  } else if (AUTO_LOAD_TOOL) {
    showInlineLoading();
    _autoLoad();
  } else {
    showEmptyState();
  }
}

_init();

})();
