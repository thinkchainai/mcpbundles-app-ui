"""
Dashboard components - Declarative building blocks for dashboards.

Components define layout and data bindings. The renderer converts them to HTML.
Data binding uses dot-notation paths (e.g., "data.totals.notes") that are
resolved at runtime in the browser when data arrives via MCP.
"""

from dataclasses import dataclass, field
from typing import Optional, Union


# =============================================================================
# LAYOUT COMPONENTS
# =============================================================================


@dataclass
class Grid:
    """
    Grid layout container.

    Usage:
        Grid(cols=2)(
            Chart.bar("byDay"),
            RecentList("recent"),
        )
    """

    cols: int = 2
    gap: str = "24px"
    children: list = field(default_factory=list)

    def __call__(self, *children) -> "Grid":
        """Allow Grid(cols=2)(child1, child2) syntax."""
        self.children = list(children)
        return self


@dataclass
class Section:
    """
    Named section with header.

    Usage:
        Section("Pipeline Overview", children=[...])
    """

    title: str
    children: list = field(default_factory=list)
    subtitle: Optional[str] = None


@dataclass
class Card:
    """
    Generic card container.

    Usage:
        Card(title="Overview")(
            BarList("stages"),
        )
    """

    title: Optional[str] = None
    subtitle: Optional[str] = None
    children: list = field(default_factory=list)

    def __call__(self, *children) -> "Card":
        self.children = list(children)
        return self


# =============================================================================
# STAT COMPONENTS
# =============================================================================


@dataclass
class Stat:
    """
    Single statistic display.

    Args:
        bind: Data path to the value (e.g., "totals.notes")
        label: Display label
        primary: If True, visually emphasized
        trend_bind: Optional data path for trend indicator
        format: Optional format type ("number", "percent", "currency")
    """

    bind: str
    label: str
    primary: bool = False
    trend_bind: Optional[str] = None
    format: str = "number"


@dataclass
class Stats:
    """
    Row of statistics.

    Usage:
        Stats(
            Stat("total", "Total", primary=True),
            Stat("thisWeek", "This Week"),
            Stat("lastWeek", "Last Week"),
        )
    """

    items: list = field(default_factory=list)

    def __init__(self, *items: Stat):
        self.items = list(items)


# =============================================================================
# CHART COMPONENTS
# =============================================================================


class Chart:
    """
    Chart factory with static methods for different chart types.

    Usage:
        Chart.bar("byDay", title="Last 30 Days")
        Chart.comparison("thisWeek", "lastWeek", title="Week over Week")
        Chart.funnel("stages", title="Pipeline")
    """

    @staticmethod
    def bar(
        bind: str,
        title: Optional[str] = None,
        color: str = "accent",
        height: str = "160px",
    ) -> "BarChart":
        """Bar chart for time series or categorical data."""
        return BarChart(bind=bind, title=title, color=color, height=height)

    @staticmethod
    def comparison(
        bind_current: str,
        bind_previous: str,
        title: Optional[str] = None,
        labels: tuple = ("This Period", "Last Period"),
    ) -> "ComparisonChart":
        """Side-by-side comparison of two values."""
        return ComparisonChart(
            bind_current=bind_current,
            bind_previous=bind_previous,
            title=title,
            label_current=labels[0],
            label_previous=labels[1],
        )

    @staticmethod
    def funnel(
        bind: str,
        title: Optional[str] = None,
    ) -> "FunnelChart":
        """Funnel/pipeline stage chart."""
        return FunnelChart(bind=bind, title=title)

    @staticmethod
    def distribution(
        bind: str,
        title: Optional[str] = None,
    ) -> "DistributionChart":
        """Distribution breakdown (e.g., by category)."""
        return DistributionChart(bind=bind, title=title)


@dataclass
class BarChart:
    """Bar chart component."""

    bind: str
    title: Optional[str] = None
    color: str = "accent"
    height: str = "160px"


@dataclass
class ComparisonChart:
    """Comparison chart (e.g., week over week)."""

    bind_current: str
    bind_previous: str
    title: Optional[str] = None
    label_current: str = "Current"
    label_previous: str = "Previous"


@dataclass
class FunnelChart:
    """Pipeline/funnel stage chart."""

    bind: str
    title: Optional[str] = None


@dataclass
class DistributionChart:
    """Distribution breakdown chart."""

    bind: str
    title: Optional[str] = None


# =============================================================================
# LIST COMPONENTS
# =============================================================================


@dataclass
class ListPicker:
    """
    List selection component (for dashboards that need to pick a list first).

    Args:
        on_select: JS callback name when list is selected
        show_type: Whether to show list type badge
    """

    on_select: str = "onListSelected"
    show_type: bool = True


@dataclass
class RecentList:
    """
    Recent items list.

    Args:
        bind: Data path to array of items
        title: Optional section title
        item_title: Template for item title (uses item fields)
        item_subtitle: Template for item subtitle
        max_items: Maximum items to show
    """

    bind: str
    title: Optional[str] = None
    item_title: str = "{content}"
    item_subtitle: str = "{date}"
    max_items: int = 10


@dataclass
class BarList:
    """
    Horizontal bar list (for showing distributions, rankings).

    Args:
        bind: Data path to array of {name, value} items
        title: Optional section title
        show_percent: Whether to show percentage
    """

    bind: str
    title: Optional[str] = None
    show_percent: bool = True
    max_items: int = 10


@dataclass
class StageList:
    """
    Pipeline stage list with bars.

    Args:
        bind: Data path to stages array
        title: Optional section title
    """

    bind: str
    title: Optional[str] = None


# =============================================================================
# SPECIAL COMPONENTS
# =============================================================================


@dataclass
class ErrorBanner:
    """Error banner (usually auto-included)."""

    pass


@dataclass
class RefreshButton:
    """Refresh button component (deprecated - use addViewActions() in header instead).
    
    NOTE: Refresh buttons should ONLY be added via addViewActions() in the header.
    Footer refresh buttons have been removed from the dashboard template.
    """

    label: str = "Refresh"


@dataclass
class LoadingState:
    """Loading state placeholder."""

    message: str = "Loading..."


# =============================================================================
# RAW HTML/JS ESCAPE HATCH
# =============================================================================


@dataclass
class Raw:
    """
    Raw HTML content (escape hatch for custom content).

    Usage:
        Raw('<div class="custom">Custom HTML</div>')
    """

    html: str


@dataclass
class CustomScript:
    """
    Custom JavaScript to inject.

    Usage:
        CustomScript('function customHandler() { ... }')
    """

    js: str

