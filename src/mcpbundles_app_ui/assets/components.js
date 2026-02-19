function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function renderDashboard(data) {
  console.log('[Dashboard] Rendering with data:', data);
  if (!data || data.error) {
    if (data?.error) showError(data.error);
    return;
  }

  document.querySelectorAll('.stat-card[data-bind]').forEach(el => {
    const bind = el.dataset.bind;
    const value = getNestedValue(data, bind);
    const valueEl = el.querySelector('.stat-value');
    if (valueEl && value !== undefined) {
      valueEl.textContent = typeof value === 'number' ? value.toLocaleString() : value;
    }

    const trendBind = el.dataset.trendBind;
    const trendEl = el.querySelector('.stat-trend');
    if (trendBind && trendEl) {
      const trend = getNestedValue(data, trendBind);
      if (trend === 'up') {
        trendEl.className = 'stat-trend up';
        trendEl.textContent = '\u2191 vs last period';
      } else if (trend === 'down') {
        trendEl.className = 'stat-trend down';
        trendEl.textContent = '\u2193 vs last period';
      }
    }
  });

  document.querySelectorAll('.chart-container[data-type="bar"]').forEach(el => {
    const bind = el.dataset.bind;
    const chartData = getNestedValue(data, bind);
    if (chartData) renderBarChart(el, chartData);
  });

  document.querySelectorAll('.comparison-chart').forEach(el => {
    const current = getNestedValue(data, el.dataset.bindCurrent);
    const previous = getNestedValue(data, el.dataset.bindPrevious);
    if (current !== undefined && previous !== undefined) {
      renderComparisonChart(el, current, previous, el.dataset.labelCurrent, el.dataset.labelPrevious);
    }
  });

  document.querySelectorAll('.bar-list').forEach(el => {
    const bind = el.dataset.bind;
    const listData = getNestedValue(data, bind);
    if (listData) renderBarList(el, listData, parseInt(el.dataset.max || '10'));
  });

  document.querySelectorAll('.recent-list').forEach(el => {
    const bind = el.dataset.bind;
    const listData = getNestedValue(data, bind);
    if (listData) renderRecentList(el, listData, parseInt(el.dataset.max || '10'));
  });

  document.querySelectorAll('.stage-list').forEach(el => {
    const bind = el.dataset.bind;
    const stageData = getNestedValue(data, bind);
    if (stageData) renderStageList(el, stageData);
  });

  document.querySelectorAll('.funnel-chart').forEach(el => {
    const bind = el.dataset.bind;
    const funnelData = getNestedValue(data, bind);
    if (funnelData) renderStageList(el, funnelData);
  });
}

function renderBarChart(container, data) {
  let entries;
  if (Array.isArray(data)) {
    entries = data;
  } else {
    entries = Object.entries(data).map(([k, v]) => ({ key: k, value: v }));
  }

  const values = entries.map(e => e.value || e.count || 0);
  const max = Math.max(...values, 1);

  container.innerHTML = `
    <div class="bar-chart-wrapper">
      ${entries.map((e, i) => {
        const val = e.value || e.count || 0;
        const height = Math.max((val / max) * 100, 2);
        return `<div class="bar-chart-bar" style="height: ${height}%" title="${e.key || e.date}: ${val}"></div>`;
      }).join('')}
    </div>
    <div class="bar-chart-labels">
      <span>${entries[0]?.key || entries[0]?.date || ''}</span>
      <span>${entries[entries.length - 1]?.key || entries[entries.length - 1]?.date || ''}</span>
    </div>
  `;
}

function renderComparisonChart(container, current, previous, labelCurrent, labelPrevious) {
  const max = Math.max(current, previous, 1);
  const currentHeight = (current / max) * 100;
  const previousHeight = (previous / max) * 100;

  container.innerHTML = `
    <div class="comparison-item">
      <div class="comparison-bar previous" style="height: ${Math.max(previousHeight, 8)}px"></div>
      <div class="comparison-value">${previous}</div>
      <div class="comparison-label">${labelPrevious}</div>
    </div>
    <div class="comparison-item">
      <div class="comparison-bar current" style="height: ${Math.max(currentHeight, 8)}px"></div>
      <div class="comparison-value">${current}</div>
      <div class="comparison-label">${labelCurrent}</div>
    </div>
  `;
}

function renderBarList(container, data, maxItems) {
  const items = Array.isArray(data) ? data : Object.entries(data).map(([name, value]) => ({ name, value }));
  const sliced = items.slice(0, maxItems);
  const max = Math.max(...sliced.map(i => i.value || i.count || 0), 1);
  const total = sliced.reduce((sum, i) => sum + (i.value || i.count || 0), 0);

  container.innerHTML = sliced.map(item => {
    const value = item.value || item.count || 0;
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const barWidth = (value / max) * 100;
    return `
      <div class="bar-list-item">
        <div class="bar-list-header">
          <span class="bar-list-name">${item.name}</span>
          <span class="bar-list-value">${value} (${pct}%)</span>
        </div>
        <div class="bar-list-track">
          <div class="bar-list-fill" style="width: ${barWidth}%"></div>
        </div>
      </div>
    `;
  }).join('') || '<div class="loading-placeholder">No data</div>';
}

function renderRecentList(container, data, maxItems) {
  const items = Array.isArray(data) ? data.slice(0, maxItems) : [];

  container.innerHTML = items.map(item => {
    const title = item.content?.slice(0, 50) || item.title || item.name || 'Item';
    const date = item.date_created || item.date || item.created_at;
    const dateStr = date ? new Date(date).toLocaleDateString() : '';
    return `
      <div class="recent-list-item">
        <div class="recent-item-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="recent-item-content">
          <div class="recent-item-title">${title}</div>
          <div class="recent-item-meta">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('') || '<div class="loading-placeholder">No items</div>';
}

function renderStageList(container, data) {
  const items = Array.isArray(data) ? data : Object.entries(data).map(([name, count]) => ({ name, count }));
  const max = Math.max(...items.map(i => i.count || i.value || 0), 1);
  const total = items.reduce((sum, i) => sum + (i.count || i.value || 0), 0);

  container.innerHTML = items.map((item, i) => {
    const count = item.count || item.value || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const barWidth = (count / max) * 100;
    return `
      <div class="stage-item">
        <div class="stage-name" title="${item.name}">${item.name}</div>
        <div class="stage-bar-track">
          <div class="stage-bar-fill color-${i % 6}" style="width: ${barWidth}%">
            ${barWidth > 20 ? count : ''}
          </div>
        </div>
        <div class="stage-stats">
          <div class="stage-count">${count}</div>
          <div class="stage-percent">${pct}%</div>
        </div>
      </div>
    `;
  }).join('') || '<div class="loading-placeholder">No stages</div>';
}
