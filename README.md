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
- **Interactive charts**: Built-in [Frappe Charts](https://frappe.io/charts) (SVG, CSP-safe, zero dependencies) — bar, line, pie, donut, percentage, heatmap
- **MCP protocol client**: Built-in JavaScript for `initializeMCP()`, `callTool()`, `sendMessage()`, `askAI()`
- **Navigation**: Breadcrumb system with `setBreadcrumbs()`, `pushBreadcrumb()`, `popBreadcrumb()`
- **Loading states**: `showLoading()`, `hideLoading()`, `withLoading()`, `paginateAll()`
- **Export utilities**: `copyToClipboard()`, `toCSV()`, `exportAsCSV()`
- **Toast notifications**: `showToast()` for success/error feedback
- **Path-based assets**: `custom_head` and `custom_scripts` accept `Path` objects for file-based CSS/JS
- **Zero Python dependencies**: Only stdlib. Produces standalone HTML with all CSS/JS inline.

## Charts

Built-in [Frappe Charts](https://frappe.io/charts) provides real interactive SVG charts. Available globally in `custom_scripts`:

```javascript
// Bar chart
renderBarChart('container-id', ['Mon', 'Tue', 'Wed'], [10, 20, 15]);

// Line chart with area fill
renderLineChart('container-id', ['Jan', 'Feb', 'Mar'], [100, 150, 130]);

// Pie chart
renderPieChart('container-id', ['Chrome', 'Firefox', 'Safari'], [60, 25, 15]);

// Donut chart
renderPieChart('container-id', labels, values, { donut: true });

// Percentage chart (horizontal stacked bar)
renderPercentageChart('container-id', labels, values);

// Full control
renderChart('container-id', {
  type: 'bar',
  data: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [
      { name: 'Revenue', values: [100, 200, 150, 300] },
      { name: 'Costs', values: [80, 150, 120, 200] }
    ]
  },
  colors: ['#3b82f6', '#ef4444'],
  height: 300,
  barOptions: { stacked: true }
});

// Update existing chart data
updateChart('container-id', newData);
```

Charts automatically use the app's theme colors (`--chart-1` through `--chart-6`).

## Components

| Component | Description |
|-----------|-------------|
| `App` | Base class for app definitions |
| `Stats` | Row of statistic cards |
| `Stat` | Single statistic with data binding |
| `Card` | Container with optional title |
| `Grid` | Grid layout (2-4 columns) |
| `Chart.bar()` | Bar chart with data binding |
| `Chart.comparison()` | Side-by-side comparison |
| `Chart.funnel()` | Pipeline/funnel chart |
| `BarList` | Horizontal bar ranking list |
| `RecentList` | Recent items list |
| `StageList` | Pipeline stage list |
| `Raw` | Escape hatch for custom HTML |

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
