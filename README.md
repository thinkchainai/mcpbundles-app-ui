# mcpbundles-app-ui

Python library for building MCP App UIs. Define an app declaratively in Python, get self-contained HTML with built-in MCP protocol support and interactive charts.

## Installation

```bash
pip install mcpbundles-app-ui
```

## Quick Start

```python
from mcpbundles_app_ui import App, LightTheme, Stats, Stat, Card

class MyApp(App):
    name = "My App"
    subtitle = "Analytics overview"
    theme = LightTheme(accent="#3b82f6")

    layout = [
        Stats(
            Stat("preview.total", "Total", primary=True),
            Stat("preview.thisWeek", "This Week"),
        ),
        Card(title="Select an option to explore"),
    ]

# Generate self-contained HTML
html = MyApp().render()
```

## Features

- **Declarative components**: `Stats`, `Stat`, `Card`, `Grid`, `Chart.bar()`, `BarList`, `RecentList`, and more
- **Theme system**: `LightTheme` and `DarkTheme` with customizable accent colors, fonts, and all design tokens
- **Interactive charts**: Built-in canvas chart engine (18 chart types, CSP-safe, zero dependencies) with declarative Python components
- **MCP protocol client**: Built-in JavaScript for `initializeMCP()`, `callTool()`, `sendMessage()`, `askAI()`
- **Navigation**: Breadcrumb system with `setBreadcrumbs()`, `pushBreadcrumb()`, `popBreadcrumb()`
- **Loading states**: `showLoading()`, `hideLoading()`, `withLoading()`, `paginateAll()`
- **Export utilities**: `copyToClipboard()`, `toCSV()`, `exportAsCSV()`
- **Toast notifications**: `showToast()` for success/error feedback
- **Path-based assets**: `custom_head` and `custom_scripts` accept `Path` objects for file-based CSS/JS
- **Zero Python dependencies**: Only stdlib. Produces standalone HTML with all CSS/JS inline.

## Charts

Charts are defined declaratively in your Python layout using `Chart` factory methods:

```python
from mcpbundles_app_ui import Chart, Grid

layout = [
    Grid(cols=2)(
        Chart.bar("data.byMonth", title="Monthly Revenue"),
        Chart.comparison("data.thisWeek", "data.lastWeek", title="Week over Week"),
    ),
    Chart.funnel("data.pipeline", title="Sales Pipeline"),
    Chart.distribution("data.byCategory", title="Category Breakdown"),
]
```

The library includes two rendering engines:

- **Chart engine** — 18 canvas chart types (candlestick, line, area, bar, column, dual axes, scatter, pie, treemap, radar, histogram, heatmap, funnel, table, and 4 card types). Used by chart-driven apps where the user controls views via dropdowns and selectors.
- **Tabbed engine** — Multi-tool apps where each tab calls a different MCP tool. Charts render within tab content areas with a shared period toolbar.

Charts automatically use the app's theme colors (`--chart-1` through `--chart-6`).

## Components

| Component | Description |
|-----------|-------------|
| `App` | Base class for app definitions |
| `Stats` | Row of statistic cards |
| `Stat` | Single statistic with data binding |
| `Card` | Container with optional title |
| `Grid` | Grid layout (2-4 columns) |
| `Section` | Named section with header and subtitle |
| `Chart.bar()` | Bar chart with data binding |
| `Chart.comparison()` | Side-by-side comparison of two values |
| `Chart.funnel()` | Pipeline/funnel stage chart |
| `Chart.distribution()` | Distribution breakdown by category |
| `ListPicker` | List selection component with callback |
| `BarList` | Horizontal bar ranking list |
| `RecentList` | Recent items list |
| `StageList` | Pipeline stage list with bars |
| `Raw` | Escape hatch for custom HTML |
| `CustomScript` | Inject custom JavaScript |

## Themes

```python
from mcpbundles_app_ui import LightTheme, DarkTheme

# Custom accent color
theme = LightTheme(accent="#8b5cf6")

# Custom fonts
theme = LightTheme(
    accent="#3b82f6",
    font_family="'Inter', system-ui, sans-serif",
    font_url="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
)
```

## File-Based Assets

Load CSS/JS from files instead of inline strings:

```python
from pathlib import Path
from mcpbundles_app_ui import App, LightTheme

class MyApp(App):
    name = "My App"
    theme = LightTheme()
    custom_head = Path(__file__).parent / "assets/styles.html"
    custom_scripts = Path(__file__).parent / "assets/app.js"
```

## License

MIT
