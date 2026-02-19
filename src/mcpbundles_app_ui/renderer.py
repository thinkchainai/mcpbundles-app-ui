"""
App renderer - Generates complete HTML documents from app definitions.

The renderer takes an app definition (theme + layout) and produces
a standalone HTML document compliant with MCP UI spec (text/html+mcp).
"""

import functools
import json
from pathlib import Path
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

_ASSETS = Path(__file__).parent / "assets"


@functools.cache
def _load_asset(name: str) -> str:
    return (_ASSETS / name).read_text(encoding="utf-8")


class AppRenderer:
    """Renders app definitions to HTML."""

    def __init__(self, theme: Theme):
        self.theme = theme

    def render(
        self,
        name: str,
        subtitle: Optional[str],
        layout: list,
        custom_head: Optional[str] = None,
        custom_scripts: Optional[str] = None,
        app_config: Optional[dict] = None,
    ) -> str:
        """Generate complete HTML document."""
        content_html = self._render_layout(layout)
        app_config_js = (
            f"    window.__APP_CONFIG__ = {json.dumps(app_config)};\n"
            if app_config
            else ""
        )
        chart_engine_js = _load_asset("chart-engine.js") if app_config else ""
        chart_engine_css = _load_asset("chart-engine.css") if app_config else ""

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{name}</title>
  {self._render_font_link()}
  <style>
{self.theme.get_css_variables()}
{_load_asset("base.css")}
{_load_asset("components.css")}
{chart_engine_css}
  </style>
  {custom_head or ''}
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <nav id="breadcrumb" class="breadcrumb" aria-label="Breadcrumb"></nav>
      <h1 class="dashboard-title" id="dashboard-title">{name}</h1>
      {f'<p class="dashboard-subtitle" id="dashboard-subtitle">{subtitle}</p>' if subtitle else '<p class="dashboard-subtitle" id="dashboard-subtitle"></p>'}
      <div id="header-actions" class="header-actions"></div>
    </header>

    <div id="error-banner" class="error-banner">
      <p id="error-message"></p>
    </div>

    <main class="dashboard-content">
{content_html}
    </main>
  </div>

  <script>
{_load_asset("mcp-client.js")}
{app_config_js}
{chart_engine_js}
{_load_asset("components.js")}
{custom_scripts or ''}

    // Auto-add header actions if dashboard defines askAboutCurrentView and refreshCurrentView
    if (typeof window.askAboutCurrentView === 'function' && typeof window.refreshCurrentView === 'function') {{
      addViewActions(window.askAboutCurrentView, window.refreshCurrentView);
    }}

    initializeMCP();
  </script>
</body>
</html>"""

    def _render_font_link(self) -> str:
        """Render Google Fonts link if configured."""
        if self.theme.font_url:
            return (
                '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                f'  <link href="{self.theme.font_url}" rel="stylesheet">'
            )
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

        if isinstance(component, Stats):
            stats_html = "\n".join(
                self._render_stat(stat, indent + 2) for stat in component.items
            )
            return f"""{pad}<div class="stats-row">
{stats_html}
{pad}</div>"""

        if isinstance(component, Grid):
            children_html = "\n".join(
                self._render_component(child, indent + 2) for child in component.children
            )
            return f"""{pad}<div class="grid grid-{component.cols}">
{children_html}
{pad}</div>"""

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

        if isinstance(component, Section):
            children_html = "\n".join(
                self._render_component(child, indent + 2) for child in component.children
            )
            return f"""{pad}<section class="section">
{pad}  <h2 class="section-title">{component.title}</h2>
{children_html}
{pad}</section>"""

        if isinstance(component, BarChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="chart-container" data-bind="{component.bind}" data-type="bar" style="height: {component.height}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading chart...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, ComparisonChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="comparison-chart" data-bind-current="{component.bind_current}" data-bind-previous="{component.bind_previous}" data-label-current="{component.label_current}" data-label-previous="{component.label_previous}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, FunnelChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="funnel-chart" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading stages...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, DistributionChart):
            title_html = f'<h3 class="chart-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="distribution-chart" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

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

        if isinstance(component, RecentList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="recent-list" data-bind="{component.bind}" data-max="{component.max_items}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, BarList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="bar-list" data-bind="{component.bind}" data-max="{component.max_items}" data-show-percent="{str(component.show_percent).lower()}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, StageList):
            title_html = f'<h3 class="list-title">{component.title}</h3>' if component.title else ''
            return f"""{pad}<div class="card">
{pad}  {title_html}
{pad}  <div class="stage-list" data-bind="{component.bind}">
{pad}    <div class="loading-placeholder"><div class="loading-spinner"></div><span>Loading stages...</span></div>
{pad}  </div>
{pad}</div>"""

        if isinstance(component, Raw):
            return f"{pad}{component.html}"

        if isinstance(component, CustomScript):
            return ""

        return f"{pad}<!-- Unknown component: {type(component).__name__} -->"

    def _render_stat(self, stat: Stat, indent: int) -> str:
        """Render a single stat card."""
        pad = " " * indent
        primary_class = " stat-primary" if stat.primary else ""
        trend_attr = f' data-trend-bind="{stat.trend_bind}"' if stat.trend_bind else ""
        return f"""{pad}<div class="stat-card{primary_class}" data-bind="{stat.bind}"{trend_attr}>
{pad}  <div class="stat-value">\u2014</div>
{pad}  <div class="stat-label">{stat.label}</div>
{pad}  <div class="stat-trend"></div>
{pad}</div>"""
