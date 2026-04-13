"""
mcpbundles-app-ui — Declarative MCP App UI builder.

Define an app in Python, get self-contained HTML with built-in MCP protocol support.

Usage:
    from mcpbundles_app_ui import App, LightTheme, Stats, Stat, Card
    from pathlib import Path

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

        # Load CSS/JS from files — Path objects are auto-read on render
        custom_head = Path(__file__).parent / "assets/head.html"
        custom_scripts = Path(__file__).parent / "assets/scripts.js"

    html = MyApp().render()
"""

from .app import App
from .components import (
    BarChart,
    BarList,
    Card,
    Chart,
    ComparisonChart,
    CustomScript,
    DistributionChart,
    ErrorBanner,
    FunnelChart,
    Gate,
    Grid,
    ListPicker,
    LoadingState,
    Raw,
    RecentList,
    RefreshButton,
    Section,
    StageList,
    Stat,
    Stats,
)
from .renderer import AppRenderer
from .themes import DarkTheme, LightTheme, Theme

__all__ = [
    "App",
    "AppRenderer",
    # Themes
    "Theme",
    "LightTheme",
    "DarkTheme",
    # Layout
    "Grid",
    "Section",
    "Card",
    # Stats
    "Stat",
    "Stats",
    # Charts
    "Chart",
    "BarChart",
    "ComparisonChart",
    "FunnelChart",
    "DistributionChart",
    # Lists
    "ListPicker",
    "RecentList",
    "BarList",
    "StageList",
    # Gates
    "Gate",
    # Special
    "ErrorBanner",
    "RefreshButton",
    "LoadingState",
    "Raw",
    "CustomScript",
]
