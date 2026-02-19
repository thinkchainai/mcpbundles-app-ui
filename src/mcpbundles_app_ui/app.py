"""
Base App class for declarative MCP App UI definitions.
"""

from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, Optional, Union

from .renderer import AppRenderer

if TYPE_CHECKING:
    from .themes import Theme


class App:
    """
    Base class for MCP App UI definitions.

    Subclasses define:
        - name: App title
        - subtitle: Optional description
        - theme: Theme instance (LightTheme/DarkTheme)
        - layout: List of components to render
        - custom_head: CSS/HTML as a string or Path to a file
        - custom_scripts: JavaScript as a string or Path to a file

    Chart-engine apps (single tool, control-driven):
        - tool_name: MCP tool to call (e.g. "stock_app")
        - controls: view -> control groups config
        - controls_defaults: Default values for control keys

    Tabbed-engine apps (multi-tool, tab-driven):
        - tool_name: MCP tool that opens the app
        - tabs: List of tab definitions [{id, label, tool, type, ...}]
        - periods: Period values for toolbar (e.g. ["1y","2y","5y"])
        - default_period: Default period (e.g. "5y")
        - tool_catalog: Tool reference list for the "tools" tab
        - tool_catalog_intro: HTML intro text for the tools tab
        - footer_text: Footer text (e.g. "FRED · BLS · Treasury")
    """

    name: ClassVar[str] = "App"
    layout: ClassVar[list] = []

    subtitle: ClassVar[Optional[str]] = None
    theme: ClassVar[Optional["Theme"]] = None  # noqa: F821 - forward ref

    custom_head: ClassVar[Optional[Union[str, Path]]] = None
    custom_scripts: ClassVar[Optional[Union[str, Path]]] = None

    tool_name: ClassVar[Optional[str]] = None
    controls: ClassVar[Optional[dict[str, Any]]] = None
    controls_defaults: ClassVar[Optional[dict[str, Any]]] = None

    tabs: ClassVar[Optional[list[dict[str, Any]]]] = None
    periods: ClassVar[Optional[list[str]]] = None
    default_period: ClassVar[Optional[str]] = None
    tool_catalog: ClassVar[Optional[list[dict[str, Any]]]] = None
    tool_catalog_intro: ClassVar[Optional[str]] = None
    footer_text: ClassVar[Optional[str]] = None

    def __init__(self):
        pass

    @staticmethod
    def _resolve_content(value: Optional[Union[str, Path]]) -> Optional[str]:
        """Resolve a string or Path to string content."""
        if value is None:
            return None
        if isinstance(value, Path):
            return value.read_text(encoding="utf-8")
        return value

    def _get_app_config(self) -> Optional[dict[str, Any]]:
        """Build app config for chart-engine or tabbed-engine apps."""
        if self.tabs:
            config: dict[str, Any] = {"tabs": self.tabs}
            if self.tool_name:
                config["toolName"] = self.tool_name
            if self.periods:
                config["periods"] = self.periods
            if self.default_period:
                config["defaultPeriod"] = self.default_period
            if self.tool_catalog:
                config["toolCatalog"] = self.tool_catalog
            if self.tool_catalog_intro:
                config["toolCatalogIntro"] = self.tool_catalog_intro
            if self.footer_text:
                config["footerText"] = self.footer_text
            theme = self.theme
            if theme and hasattr(theme, "chart_colors") and theme.chart_colors:
                config["colors"] = theme.chart_colors
            return config

        if self.tool_name and self.controls:
            return {
                "toolName": self.tool_name,
                "controls": self.controls,
                "defaults": self.controls_defaults or {},
            }

        return None

    def render(self) -> str:
        """
        Generate complete HTML document for this app.

        Path objects in custom_head/custom_scripts are read automatically.

        Returns:
            str: Complete HTML5 document with embedded CSS/JS,
                 compliant with MCP UI spec (text/html+mcp).
        """
        from .themes import LightTheme

        theme = self.theme or LightTheme()
        renderer = AppRenderer(theme=theme)

        return renderer.render(
            name=self.name,
            subtitle=self.subtitle,
            layout=self.layout,
            custom_head=self._resolve_content(self.custom_head),
            custom_scripts=self._resolve_content(self.custom_scripts),
            app_config=self._get_app_config(),
        )

    @classmethod
    def to_html(cls) -> str:
        """Class method alternative to render()."""
        return cls().render()
