/**
 * Gate Engine — declarative usage/billing/auth overlays for MCP App UIs.
 *
 * Reads `window.__APP_CONFIG__.gates` (array of gate definitions) and
 * intercepts tool results whose `status` field matches a gate. When
 * triggered, renders a frosted-glass overlay with the configured CTA
 * instead of passing data to the dashboard engine.
 *
 * Gate definition shape (serialized from Python Gate dataclass):
 *   { status, title, message, ctaLabel, urlKey, icon }
 *
 * `message` supports {key} placeholders resolved from the tool response.
 *
 * Works universally — inside ChatGPT, Claude Desktop, our /try page,
 * or any third-party embed using mcpbundles-app-ui.
 */
(function() {
'use strict';

var cfg = window.__APP_CONFIG__ || {};
var GATES = cfg.gates || [];
if (!GATES.length) return;

var GATE_MAP = {};
for (var i = 0; i < GATES.length; i++) {
  GATE_MAP[GATES[i].status] = GATES[i];
}

var ICONS = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
};

function interpolate(template, data) {
  return template.replace(/\{(\w+)\}/g, function(match, key) {
    var val = data[key];
    return val !== null && val !== undefined ? String(val) : match;
  });
}

function resolveUrl(data, urlKey) {
  if (data[urlKey]) return data[urlKey];
  if (urlKey !== 'signup_url' && data.signup_url) return data.signup_url;
  if (data.action_url) return data.action_url;
  if (data.url) return data.url;
  return null;
}

/**
 * Check if a parsed tool response triggers a gate.
 * Returns true if a gate was triggered (overlay rendered), false otherwise.
 */
function checkGate(data) {
  if (!data || typeof data !== 'object' || !data.status) return false;

  var gate = GATE_MAP[data.status];
  if (!gate) return false;

  renderGateOverlay(gate, data);
  return true;
}

function renderGateOverlay(gate, data) {
  var existing = document.getElementById('gate-overlay');
  if (existing) existing.remove();

  var iconSvg = ICONS[gate.icon] || ICONS.lock;
  var message = interpolate(gate.message, data);
  var url = resolveUrl(data, gate.urlKey);

  var overlay = document.createElement('div');
  overlay.id = 'gate-overlay';
  overlay.className = 'gate-overlay';

  overlay.innerHTML =
    '<div class="gate-card">' +
      '<div class="gate-icon">' + iconSvg + '</div>' +
      '<div class="gate-title">' + escSafe(gate.title) + '</div>' +
      '<div class="gate-message">' + escSafe(message) + '</div>' +
      (url
        ? '<button class="gate-cta" id="gate-cta-btn">' + escSafe(gate.ctaLabel) + ' ' + ICONS.arrow + '</button>'
        : '<span class="gate-cta" style="opacity:0.6;cursor:default">' + escSafe(gate.ctaLabel) + '</span>') +
    '</div>';

  document.body.appendChild(overlay);

  if (url) {
    var btn = document.getElementById('gate-cta-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        try { window.top.location.href = url; } catch (e) { window.open(url, '_blank'); }
      });
    }
  }
}

function escSafe(t) {
  if (!t) return '';
  var d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function escAttrSafe(t) {
  return (t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.__checkGate = checkGate;

})();
