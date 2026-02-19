"""
App renderer - Generates complete HTML documents from app definitions.

The renderer takes an app definition (theme + layout) and produces
a standalone HTML document compliant with MCP UI spec (text/html+mcp).
"""

from typing import Optional


from .components import (
    BarChart,
    BarList,
    Card,
    ComparisonChart,
    CustomScript,
    DistributionChart,
    FunnelChart,
    Grid,
    ListPicker,
    Raw,
    RecentList,
    Section,
    Stat,
    Stats,
    StageList,
)
from .themes.base import Theme


class AppRenderer:
    """
    Renders app definitions to HTML.

    Takes theme configuration and layout components, produces complete HTML.
    """

    def __init__(self, theme: Theme):
        self.theme = theme

    def render(
        self,
        name: str,
        subtitle: Optional[str],
        layout: list,
        custom_head: Optional[str] = None,
        custom_scripts: Optional[str] = None,
    ) -> str:
        """Generate complete HTML document."""
        # Build components HTML
        content_html = self._render_layout(layout)

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  {self._render_font_link()}
  <style>
{self.theme.get_css_variables()}
{self._get_base_css()}
{self._get_component_css()}
  </style>
  {custom_head or ''}
</head>
<body>
  <div class="dashboard">
    <!-- Header -->
    <header class="dashboard-header">
      <nav id="breadcrumb" class="breadcrumb" aria-label="Breadcrumb"></nav>
      <h1 class="dashboard-title" id="dashboard-title">{name}</h1>
      {f'<p class="dashboard-subtitle" id="dashboard-subtitle">{subtitle}</p>' if subtitle else '<p class="dashboard-subtitle" id="dashboard-subtitle"></p>'}
      <div id="header-actions" class="header-actions"></div>
    </header>

    <!-- Error Banner -->
    <div id="error-banner" class="error-banner">
      <p id="error-message"></p>
    </div>

    <!-- Content -->
    <main class="dashboard-content">
{content_html}
    </main>
  </div>

  <script>
{self._get_mcp_client_js()}
{self._get_component_js()}
{custom_scripts or ''}
{self._get_auto_actions_js()}

    // Initialize
    initializeMCP();
  </script>
</body>
</html>"""

    def _render_font_link(self) -> str:
        """Render Google Fonts link if configured."""
        if self.theme.font_url:
            return f'<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="{self.theme.font_url}" rel="stylesheet">'
        return ""

    def _render_layout(self, layout: list, indent: int = 6) -> str:
        """Render layout components to HTML."""
        parts = []
        for component in layout:
            html = self._render_component(component, indent)
            if html:
                parts.append(html)
        return "\n".join(parts)

    def _render_component(self, component, indent: int = 6) -> str:
        """Render a single component to HTML."""
        pad = " " * indent

        # Stats row
        if isinstance(component, Stats):
            stats_html = "\n".join(
                self._render_stat(stat, indent + 2) for stat in component.items
            )
            return f"""{pad}<div class="stats-row">
{stats_html}
{pad}</div>"""

        # Grid
        if isinstance(component, Grid):
            children_html = "\n".join(
                self._render_component(child, indent + 2) for child in component.children
            )
            return f"""{pad}<div class="grid grid-{component.cols}">
{children_html}
{pad}</div>"""

        # Card
        if isinstance(component, Card):
            children_html = "\n".join(
                self._render_component(child, indent + 2) for child in component.children
            )
            header = ""
            if component.title:
                header = f'\n{pad}  <h2 class="card-title">{component.title}</h2>'
                if component.subtitle:
                    header += f'\n{pad}  <p class="card-subtitle">{component.subtitle}</p>'
            return f"""{pad}<div class="card">{header}
{children_html}
{pad}</div>"""

        # Section
        if isinstance(component, Section):
            children_html = "\n".join(
                self._render_component(child, indent + 2) for child in component.children
            )
            return f"""{pad}<section class="section">
{pad}  <h2 class="section-title">{component.title}</h2>
{children_html}
{pad}</section>"""

        # Bar Chart
        if isinstance(component, BarChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="chart-container" data-bind="{component.bind}" data-type="bar" style="height: {component.height}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading chart...</span></div>
{pad}  </div>
{pad}</div>"""

        # Comparison Chart
        if isinstance(component, ComparisonChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="comparison-chart" data-bind-current="{component.bind_current}" data-bind-previous="{component.bind_previous}" data-label-current="{component.label_current}" data-label-previous="{component.label_previous}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        # Funnel Chart
        if isinstance(component, FunnelChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="funnel-chart" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading stages...</span></div>
{pad}  </div>
{pad}</div>"""

        # Distribution Chart
        if isinstance(component, DistributionChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="distribution-chart" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        # List Picker
        if isinstance(component, ListPicker):
            return f"""{pad}<div class="card list-picker-card">
{pad}  <h2 class="card-title">Select a List</h2>
{pad}  <p class="card-subtitle">Choose which pipeline to analyze</p>
{pad}  <div id="list-picker" class="list-grid">
{pad}    <div class="loading-placeholder">
{pad}      <div class="loading-spinner large"></div>
{pad}      <span>Loading lists...</span>
{pad}    </div>
{pad}  </div>
{pad}</div>"""

        # Recent List
        if isinstance(component, RecentList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="recent-list" data-bind="{component.bind}" data-max="{component.max_items}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        # Bar List
        if isinstance(component, BarList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="bar-list" data-bind="{component.bind}" data-max="{component.max_items}" data-show-percent="{str(component.show_percent).lower()}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        # Stage List
        if isinstance(component, StageList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="stage-list" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading stages...</span></div>
{pad}  </div>
{pad}</div>"""

        # Raw HTML
        if isinstance(component, Raw):
            return f"{pad}{component.html}"

        # Custom Script (handled in JS section)
        if isinstance(component, CustomScript):
            return ""

        return f"{pad}<!-- Unknown component: {type(component).__name__} -->"

    def _render_stat(self, stat: Stat, indent: int) -> str:
        """Render a single stat card."""
        pad = " " * indent
        primary_class = " stat-primary" if stat.primary else ""
        trend_attr = f' data-trend-bind="{stat.trend_bind}"' if stat.trend_bind else ""
        return f"""{pad}<div class="stat-card{primary_class}" data-bind="{stat.bind}"{trend_attr}>
{pad}  <div class="stat-value">—</div>
{pad}  <div class="stat-label">{stat.label}</div>
{pad}  <div class="stat-trend"></div>
{pad}</div>"""

    def _get_base_css(self) -> str:
        """Base CSS styles for MCP App UIs."""
        return """
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Base - matches frontend body styles */
    body {
      font-family: var(--font-family);
      background: var(--bg-page);
      color: var(--text-primary);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Dashboard container */
    .dashboard {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* Header - uses display font (Outfit) like frontend */
    .dashboard-header {
      margin-bottom: 32px;
    }
    .dashboard-title {
      font-family: var(--font-display);
      font-size: 1.875rem;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.025em;
    }
    .dashboard-subtitle {
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .dashboard-subtitle:empty {
      display: none;
    }

    /* Breadcrumb navigation */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }
    .breadcrumb:empty {
      display: none;
    }
    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .breadcrumb-link {
      color: var(--text-muted);
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s;
    }
    .breadcrumb-link:hover {
      color: var(--accent);
    }
    .breadcrumb-separator {
      color: var(--border);
      font-size: 0.75rem;
    }
    .breadcrumb-current {
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* Error banner - matches frontend destructive style */
    .error-banner {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 24px;
      display: none;
      color: var(--error);
      font-size: 0.875rem;
    }
    .error-banner.visible { display: block; }

    /* Content */
    .dashboard-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Button - matches frontend btn-orange-primary style */
    .btn-primary {
      background: linear-gradient(to right, var(--accent), color-mix(in srgb, var(--accent) 90%, black));
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: var(--radius);
      font-family: var(--font-family);
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      box-shadow: var(--shadow-md);
      transition: all 0.2s ease;
    }
    .btn-primary:hover {
      filter: brightness(1.05);
      box-shadow: var(--shadow-lg);
      transform: translateY(-1px);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      filter: none;
    }

    /* Loading spinner animation */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    .loading-spinner.large {
      width: 32px;
      height: 32px;
      border-width: 3px;
    }

    /* Loading placeholder with spinner */
    .loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-muted);
      font-size: 0.875rem;
      padding: 32px 16px;
      flex-direction: column;
    }

    .loading-placeholder.inline {
      flex-direction: row;
      padding: 20px 0;
      justify-content: flex-start;
    }

    .loading-progress {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Loading overlay for cards */
    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
      border-radius: var(--radius);
      z-index: 10;
    }

    .card { position: relative; }

    /* Focus states - matches frontend ring style */
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
"""

    def _get_component_css(self) -> str:
        """Component-specific CSS styles."""
        return """
    /* Grid */
    .grid { display: grid; gap: 24px; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-4 { grid-template-columns: repeat(4, 1fr); }

    @media (max-width: 768px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }

    /* Card - matches frontend card component */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: var(--shadow-sm);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      border-color: var(--border-focus);
    }
    .card-title {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
    }
    .card-subtitle {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: -12px;
      margin-bottom: 16px;
    }

    /* Stats row - clean, professional */
    .stats-row {
      display: flex;
      gap: 16px;
    }
    .stat-card {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      box-shadow: var(--shadow-sm);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .stat-card:hover {
      border-color: var(--border-focus);
    }
    .stat-card.stat-primary {
      background: var(--accent-soft);
      border-color: var(--accent-medium);
    }
    .stat-value {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .stat-primary .stat-value {
      color: var(--accent);
    }
    .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }
    .stat-trend {
      font-size: 0.75rem;
      margin-top: 8px;
      font-weight: 500;
    }
    .stat-trend.up { color: var(--success); }
    .stat-trend.down { color: var(--error); }

    @media (max-width: 768px) {
      .stats-row { flex-direction: column; }
    }

    /* Chart */
    .chart-container {
      position: relative;
    }
    .chart-title, .list-title {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
    }

    /* Bar chart */
    .bar-chart-wrapper {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 100%;
    }
    .bar-chart-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      min-height: 2px;
      transition: opacity 0.15s;
      cursor: pointer;
    }
    .bar-chart-bar:hover {
      opacity: 0.8;
    }
    .bar-chart-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Comparison chart */
    .comparison-chart {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 40px;
      padding: 20px 0;
    }
    .comparison-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .comparison-bar {
      width: 60px;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      transition: height 0.4s ease-out;
    }
    .comparison-bar.current { background: var(--accent); }
    .comparison-bar.previous { background: var(--border); }
    .comparison-value {
      font-size: 1.5rem;
      font-weight: 600;
    }
    .comparison-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Bar list */
    .bar-list-item {
      margin-bottom: 12px;
    }
    .bar-list-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 0.85rem;
    }
    .bar-list-name { color: var(--text-secondary); }
    .bar-list-value { font-weight: 500; }
    .bar-list-track {
      height: 6px;
      background: var(--bg-page);
      border-radius: 3px;
      overflow: hidden;
    }
    .bar-list-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
      transition: width 0.4s ease-out;
    }

    /* Recent list */
    .recent-list-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .recent-list-item:last-child { border-bottom: none; }
    .recent-item-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .recent-item-content { flex: 1; min-width: 0; }
    .recent-item-title {
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .recent-item-meta {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Stage list */
    .stage-item {
      display: grid;
      grid-template-columns: 140px 1fr 80px;
      align-items: center;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .stage-item:last-child { border-bottom: none; }
    .stage-name {
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stage-bar-track {
      height: 24px;
      background: var(--bg-page);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .stage-bar-fill {
      height: 100%;
      border-radius: var(--radius-sm);
      transition: width 0.4s ease-out;
      display: flex;
      align-items: center;
      padding-left: 8px;
      font-size: 0.75rem;
      font-weight: 500;
      color: white;
    }
    .stage-stats {
      text-align: right;
    }
    .stage-count {
      font-weight: 600;
      font-size: 0.9rem;
    }
    .stage-percent {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* List picker */
    .list-picker-card { text-align: center; }
    .list-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      text-align: left;
      margin-top: 20px;
    }
    .list-item {
      background: var(--bg-page);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 14px;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.15s;
    }
    .list-item:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .list-item-name {
      font-weight: 500;
      font-size: 0.9rem;
    }
    .list-item-type {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
      text-transform: capitalize;
    }

    /* Chart colors */
    .color-0 { background: var(--chart-1); }
    .color-1 { background: var(--chart-2); }
    .color-2 { background: var(--chart-3); }
    .color-3 { background: var(--chart-4); }
    .color-4 { background: var(--chart-5); }
    .color-5 { background: var(--chart-6); }

    /* Standardized Section Header */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-header-title {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .section-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .section-btn svg {
      flex-shrink: 0;
    }
    .section-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-soft);
    }
    .section-btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
    }
    .section-btn-primary:hover {
      opacity: 0.9;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
    }

    /* Header Action Bar - shared component for all dashboards */
    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .header-actions:empty {
      display: none;
    }
    .header-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .header-action-btn svg {
      flex-shrink: 0;
    }
    .header-action-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--accent-soft);
    }
    .header-action-btn:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .header-action-btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
    }
    .header-action-btn-primary:hover {
      opacity: 0.9;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
    }

    /* Hidden utility */
    .hidden { display: none !important; }
"""

    def _get_mcp_client_js(self) -> str:
        """MCP client JavaScript - handles all MCP communication."""
        return """
    // ==========================================================================
    // MCP Client - Handles communication with MCP host
    // ==========================================================================

    const state = {
      data: null,
      mcpInitialized: false,
      nextRequestId: 1,
      toolName: null
    };
    const pendingRequests = new Map();

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

        // Extract tool name from hostContext
        if (result.hostContext?.toolInfo?.tool?.name) {
          state.toolName = result.hostContext.toolInfo.tool.name;
          console.log('[Dashboard] Tool name:', state.toolName);
        }

        // Send initialized notification
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

    // ==========================================================================
    // SEP-1865: Send message to host chat (ui/message)
    // ==========================================================================

    /**
     * Send a message to the host's chat interface
     * @param {string} text - Message content
     * @param {string} role - Message role ('user' or 'assistant')
     */
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

    /**
     * Ask AI about specific data from the dashboard
     * @param {string} question - The question to ask
     * @param {object} context - Optional data context to include
     */
    async function askAI(question, context = null) {
      let messageText = question;
      if (context) {
        const contextStr = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
        messageText = '[Dashboard Context]\\n' + contextStr + '\\n\\n' + question;
      }
      try {
        await sendMessage(messageText, 'user');
        console.log('[Dashboard] Message sent to AI');
      } catch (e) {
        console.error('[Dashboard] Failed to send message:', e);
        showError('Failed to send message to AI');
      }
    }

    // ==========================================================================
    // Section Header Helper - Simple version
    // ==========================================================================

    window._sectionHandlers = {};

    function renderSectionHeader(title, options = {}) {
      const { id, onRefresh, onExport, getAskAIContext, badge, badgeColor } = options;
      const sectionId = id || title.toLowerCase().replace(/\\s+/g, '-');
      
      // Register handlers
      if (onRefresh) window._sectionHandlers[sectionId + '_refresh'] = onRefresh;
      if (onExport) window._sectionHandlers[sectionId + '_export'] = onExport;
      if (getAskAIContext) window._sectionHandlers[sectionId + '_askAI'] = getAskAIContext;
      
      const badgeHtml = badge ? `<span style="font-size:0.7rem;padding:2px 8px;background:${badgeColor || 'var(--text-muted)'};color:white;border-radius:10px">${badge}</span>` : '';
      
      let btns = '';
      if (onRefresh) btns += `<button class="section-btn" data-action="refresh" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Refresh</button>`;
      if (onExport) btns += `<button class="section-btn" data-action="export" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Export</button>`;
      if (getAskAIContext) btns += `<button class="section-btn section-btn-primary" data-action="askAI" data-id="${sectionId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Ask AI</button>`;
      
      // Schedule attaching handlers after DOM update
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

    /**
     * Set header action buttons - shared component for all dashboards
     * @param {Array} actions - Array of action configs: { label, icon, onClick, primary }
     * 
     * Example:
     *   setHeaderActions([
     *     { label: 'Refresh', icon: 'refresh', onClick: () => refresh() },
     *     { label: 'Ask AI about this view', icon: 'ai', onClick: askAIHandler, primary: true }
     *   ]);
     */
    // SVG icons for buttons
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
        
        // Store handler reference
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

    /**
     * Clear header actions
     */
    function clearHeaderActions() {
      const container = document.getElementById('header-actions');
      if (container) container.innerHTML = '';
      window._headerActions = [];
    }

    /**
     * Convenience: Add standard "Ask AI about this view" action
     * @param {function} getContext - Returns {question, context} for the current view
     * @param {function} onRefresh - Optional refresh handler
     */
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

    // Legacy support - redirect to new function
    function addFloatingAskAIButton(getContext) {
      addViewActions(getContext);
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.jsonrpc !== '2.0') return;

      console.log('[Dashboard] Received:', msg);

      // Handle responses
      if (msg.id && pendingRequests.has(msg.id)) {
        const handler = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (msg.result !== undefined) handler(msg.result);
        else if (msg.error) showError(msg.error.message);
        return;
      }

      // Handle tool result notification
      if (msg.method === 'ui/notifications/tool-result') {
        const sc = msg.params?.structuredContent;
        if (sc) {
          state.data = sc;
          renderDashboard(sc);
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

    // ==========================================================================
    // Loading State Helpers - Use these in dashboard custom_scripts
    // ==========================================================================

    /**
     * Show loading spinner in a container
     * @param {HTMLElement|string} container - Element or selector
     * @param {string} message - Loading message to display
     * @param {boolean} overlay - If true, shows as overlay (card must have position:relative)
     */
    function showLoading(container, message = 'Loading...', overlay = false) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;

      if (overlay) {
        // Create overlay inside the container
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
        // Replace content with loading placeholder
        el.innerHTML = `
          <div class="loading-placeholder">
            <div class="loading-spinner large"></div>
            <span>${message}</span>
          </div>
        `;
      }
    }

    /**
     * Hide loading overlay (only for overlay mode)
     * @param {HTMLElement|string} container - Element or selector
     */
    function hideLoading(container) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;
      const overlay = el.querySelector('.loading-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    /**
     * Update loading message with progress
     * @param {HTMLElement|string} container - Element or selector
     * @param {string} message - New message
     * @param {number} current - Current page/item (optional)
     * @param {number} total - Total pages/items (optional)
     */
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

    /**
     * Paginate through all pages of a tool call
     * @param {string} toolName - Name of the tool to call
     * @param {object} baseArgs - Base arguments (list_id, field_ids, etc)
     * @param {object} options - { maxPages, limit, onProgress }
     * @returns {Promise<Array>} - All items from all pages
     */
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

    /**
     * Wrap an async function with loading state
     * @param {HTMLElement|string} container - Element or selector
     * @param {Function} asyncFn - Async function to execute
     * @param {object} options - { message, overlay }
     * @returns {Promise} - Result of asyncFn
     */
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

    // ==========================================================================
    // Breadcrumb Navigation Helpers
    // ==========================================================================

    const breadcrumbState = {
      items: [],
      originalTitle: null,
      originalSubtitle: null
    };

    /**
     * Initialize breadcrumbs - call once on page load to store original title
     */
    function initBreadcrumbs() {
      const titleEl = document.getElementById('dashboard-title');
      const subtitleEl = document.getElementById('dashboard-subtitle');
      breadcrumbState.originalTitle = titleEl?.textContent || 'Dashboard';
      breadcrumbState.originalSubtitle = subtitleEl?.textContent || '';
    }

    /**
     * Set breadcrumb trail
     * @param {Array} items - Array of {label, onClick} objects. Last item is current (no onClick)
     * @param {string} newSubtitle - Optional new subtitle to show
     * 
     * Example: setBreadcrumbs([
     *   { label: 'Lists', onClick: () => showPicker() },
     *   { label: 'Dealflow' }  // Current item, no onClick
     * ], 'Analyzing 500 companies')
     */
    function setBreadcrumbs(items, newSubtitle) {
      const breadcrumbEl = document.getElementById('breadcrumb');
      const titleEl = document.getElementById('dashboard-title');
      const subtitleEl = document.getElementById('dashboard-subtitle');
      
      if (!breadcrumbEl) return;

      breadcrumbState.items = items;

      if (items.length === 0) {
        // Clear breadcrumbs, restore original title
        breadcrumbEl.innerHTML = '';
        if (titleEl) titleEl.textContent = breadcrumbState.originalTitle;
        if (subtitleEl) subtitleEl.textContent = breadcrumbState.originalSubtitle;
        return;
      }

      // Build breadcrumb HTML
      const html = items.map((item, index) => {
        const isLast = index === items.length - 1;
        const separator = isLast ? '' : '<span class="breadcrumb-separator">›</span>';
        
        if (isLast) {
          // Current item - not clickable
          return `<span class="breadcrumb-item">
            <span class="breadcrumb-current">${item.label}</span>
          </span>`;
        } else {
          // Clickable parent
          return `<span class="breadcrumb-item">
            <a class="breadcrumb-link" data-breadcrumb-index="${index}">${item.label}</a>
            ${separator}
          </span>`;
        }
      }).join('');

      breadcrumbEl.innerHTML = html;

      // Attach click handlers
      breadcrumbEl.querySelectorAll('.breadcrumb-link').forEach(link => {
        link.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.breadcrumbIndex);
          const item = breadcrumbState.items[index];
          if (item?.onClick) item.onClick();
        });
      });

      // Update title to show the root + current context
      if (titleEl && items.length > 0) {
        const current = items[items.length - 1];
        titleEl.textContent = `${breadcrumbState.originalTitle} › ${current.label}`;
      }

      // Update subtitle if provided
      if (subtitleEl && newSubtitle !== undefined) {
        subtitleEl.textContent = newSubtitle;
      }
    }

    /**
     * Clear breadcrumbs and restore original title
     */
    function clearBreadcrumbs() {
      setBreadcrumbs([]);
    }

    /**
     * Add a breadcrumb item to the trail
     * @param {string} label - Display text
     * @param {Function} onClick - Optional callback when clicked (if not last item)
     */
    function pushBreadcrumb(label, onClick) {
      // Make previous last item clickable
      if (breadcrumbState.items.length > 0) {
        const lastItem = breadcrumbState.items[breadcrumbState.items.length - 1];
        if (!lastItem.onClick && lastItem._onClick) {
          lastItem.onClick = lastItem._onClick;
        }
      }
      breadcrumbState.items.push({ label, _onClick: onClick });
      setBreadcrumbs(breadcrumbState.items);
    }

    /**
     * Pop the last breadcrumb and navigate to parent
     */
    function popBreadcrumb() {
      if (breadcrumbState.items.length > 1) {
        breadcrumbState.items.pop();
        const lastItem = breadcrumbState.items[breadcrumbState.items.length - 1];
        if (lastItem?.onClick) lastItem.onClick();
      } else {
        clearBreadcrumbs();
      }
    }

    // Initialize breadcrumbs on load
    setTimeout(initBreadcrumbs, 0);

    function parseToolResult(result) {
      if (result.structuredContent) return result.structuredContent;
      if (result.content?.[0]?.text) {
        try { return JSON.parse(result.content[0].text); } catch {}
      }
      return null;
    }

    // NOTE: Refresh functionality is handled via addViewActions() in header
    // Footer refresh button has been removed - refresh buttons should ONLY be in header
"""

    def _get_auto_actions_js(self) -> str:
        """Auto-add header actions if dashboard defines askAboutCurrentView and refreshCurrentView."""
        return """
    // Auto-add header actions if dashboard defines askAboutCurrentView and refreshCurrentView
    // This ensures Ask AI and Refresh buttons appear automatically on every view
    if (typeof window.askAboutCurrentView === 'function' && typeof window.refreshCurrentView === 'function') {
      // Auto-add buttons using the dashboard's functions
      addViewActions(window.askAboutCurrentView, window.refreshCurrentView);
    }
"""

    def _get_component_js(self) -> str:
        """Component JavaScript - renders data into DOM."""
        return """
    // ==========================================================================
    // Component Rendering - Updates DOM based on data
    // ==========================================================================

    function getNestedValue(obj, path) {
      return path.split('.').reduce((o, k) => o?.[k], obj);
    }

    function renderDashboard(data) {
      console.log('[Dashboard] Rendering with data:', data);
      if (!data || data.error) {
        if (data?.error) showError(data.error);
        return;
      }

      // Render stat cards
      document.querySelectorAll('.stat-card[data-bind]').forEach(el => {
        const bind = el.dataset.bind;
        const value = getNestedValue(data, bind);
        const valueEl = el.querySelector('.stat-value');
        if (valueEl && value !== undefined) {
          valueEl.textContent = typeof value === 'number' ? value.toLocaleString() : value;
        }

        // Trend
        const trendBind = el.dataset.trendBind;
        const trendEl = el.querySelector('.stat-trend');
        if (trendBind && trendEl) {
          const trend = getNestedValue(data, trendBind);
          if (trend === 'up') {
            trendEl.className = 'stat-trend up';
            trendEl.textContent = '↑ vs last period';
          } else if (trend === 'down') {
            trendEl.className = 'stat-trend down';
            trendEl.textContent = '↓ vs last period';
          }
        }
      });

      // Render bar charts
      document.querySelectorAll('.chart-container[data-type="bar"]').forEach(el => {
        const bind = el.dataset.bind;
        const chartData = getNestedValue(data, bind);
        if (chartData) renderBarChart(el, chartData);
      });

      // Render comparison charts
      document.querySelectorAll('.comparison-chart').forEach(el => {
        const current = getNestedValue(data, el.dataset.bindCurrent);
        const previous = getNestedValue(data, el.dataset.bindPrevious);
        if (current !== undefined && previous !== undefined) {
          renderComparisonChart(el, current, previous, el.dataset.labelCurrent, el.dataset.labelPrevious);
        }
      });

      // Render bar lists
      document.querySelectorAll('.bar-list').forEach(el => {
        const bind = el.dataset.bind;
        const listData = getNestedValue(data, bind);
        if (listData) renderBarList(el, listData, parseInt(el.dataset.max || '10'));
      });

      // Render recent lists
      document.querySelectorAll('.recent-list').forEach(el => {
        const bind = el.dataset.bind;
        const listData = getNestedValue(data, bind);
        if (listData) renderRecentList(el, listData, parseInt(el.dataset.max || '10'));
      });

      // Render stage lists
      document.querySelectorAll('.stage-list').forEach(el => {
        const bind = el.dataset.bind;
        const stageData = getNestedValue(data, bind);
        if (stageData) renderStageList(el, stageData);
      });

      // Render funnel charts
      document.querySelectorAll('.funnel-chart').forEach(el => {
        const bind = el.dataset.bind;
        const funnelData = getNestedValue(data, bind);
        if (funnelData) renderStageList(el, funnelData);
      });
    }

    function renderBarChart(container, data) {
      // data can be object {date: count} or array
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

    // ==========================================================================
    // Export Utilities (Shared across all dashboards)
    // ==========================================================================
    
    /**
     * Copy text to clipboard and show toast notification.
     * @param {string} text - Text to copy
     * @param {string} successMessage - Message to show on success
     * @param {string} successSubtitle - Subtitle for success toast
     * @returns {Promise<boolean>} - Whether copy succeeded
     */
    async function copyToClipboard(text, successMessage = '✓ Copied to clipboard', successSubtitle = '') {
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
    
    /**
     * Convert array of objects to CSV string.
     * @param {Array} data - Array of objects
     * @param {Array} columns - Column definitions [{key: 'field', label: 'Header'}]
     * @returns {string} - CSV content
     */
    function toCSV(data, columns) {
      if (!data || data.length === 0) return '';
      
      // Auto-detect columns if not provided
      if (!columns) {
        columns = Object.keys(data[0]).map(k => ({ key: k, label: k }));
      }
      
      const headers = columns.map(c => c.label || c.key);
      const rows = data.map(row => {
        return columns.map(c => {
          let val = row[c.key];
          if (val === null || val === undefined) val = '';
          // Escape quotes and wrap in quotes if contains comma/quote/newline
          val = String(val);
          if (val.includes(',') || val.includes('"') || val.includes('\\n')) {
            val = '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',');
      });
      
      return [headers.join(','), ...rows].join('\\n');
    }
    
    /**
     * Export data as CSV to clipboard.
     * @param {Array} data - Array of objects to export
     * @param {Array} columns - Column definitions
     * @param {string} name - Name for the export (shown in toast)
     */
    function exportAsCSV(data, columns, name = 'data') {
      if (!data || data.length === 0) {
        showToast('No data to export', '', 'error');
        return;
      }
      
      const csv = toCSV(data, columns);
      copyToClipboard(
        csv,
        '✓ Copied ' + data.length + ' rows to clipboard',
        'Paste into Excel, Sheets, or any text editor'
      );
    }
    
    /**
     * Show toast notification.
     * @param {string} message - Main message
     * @param {string} subtitle - Secondary text
     * @param {string} type - 'success' (default) or 'error'
     */
    function showToast(message, subtitle = '', type = 'success') {
      // Remove existing toast if any
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
      
      // Add animation keyframes if not exists
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
      
      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
"""

