# mcpbundles-app-ui

Python library for building MCP App UIs. Define an app declaratively in Python, get self-contained HTML with built-in MCP protocol support.

## Installation

```bash
pip install mcpbundles-app-ui
```

## Quick Start

```python
from mcpbundles_app_ui import App, Stats, Stat, Card
from mcpbundles_app_ui.themes import LightTheme

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
- **Theme system**: `LightTheme` and `DarkTheme` with customizable accent colors
- **MCP protocol client**: Built-in JavaScript for `initializeMCP()`, `callTool()`, `sendMessage()`, `askAI()`
- **Navigation**: Breadcrumb system with `setBreadcrumbs()`, `pushBreadcrumb()`, `popBreadcrumb()`
- **Loading states**: `showLoading()`, `hideLoading()`, `withLoading()`, `paginateAll()`
- **Export utilities**: `copyToClipboard()`, `toCSV()`, `exportAsCSV()`
- **Toast notifications**: `showToast()` for success/error feedback
- **Zero dependencies**: Only Python stdlib. Produces standalone HTML with all CSS/JS inline.

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
from mcpbundles_app_ui.themes import LightTheme, DarkTheme

# Custom accent color
theme = LightTheme(accent="#8b5cf6")

# Custom fonts
theme = LightTheme(
    accent="#3b82f6",
    font_url="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
)
```

## License

MIT
