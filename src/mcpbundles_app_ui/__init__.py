"""
mcpbundles-app-ui — Declarative MCP App UI builder.

Define an app in Python, get self-contained HTML with built-in MCP protocol support.

Usage:
    from mcpbundles_app_ui import App, Stats, Stat, Card
    from mcpbundles_app_ui.themes import LightTheme

    class MyApp(App):
        theme = LightTheme(accent="#3b82f6")
        name = "My App"
        subtitle = "Analytics overview"

        layout = [
            Stats(
                Stat("preview.total", "Total", primary=True),
                Stat("preview.thisWeek", "This Week"),
            ),
            Card(title="Select an option to explore"),
        ]

    # In resource.py:
    html = MyApp().render()

Note: Apps use dynamic navigation with callTool() for data fetching.
The layout only needs Stats (for preview metrics) and Card (nav grid placeholder).
Complex visualizations are built dynamically in custom_scripts JavaScript.
"""

from .app import App
from .components import (
    Stats,
    Stat,
    Card,
)
from .renderer import AppRenderer

__all__ = [
    "App",
    "AppRenderer",
    "Stats",
    "Stat",
    "Card",
]
