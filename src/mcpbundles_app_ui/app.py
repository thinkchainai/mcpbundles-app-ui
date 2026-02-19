"""
Base App class for declarative MCP App UI definitions.
"""

from pathlib import Path
from typing import TYPE_CHECKING, ClassVar, Optional, Union

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

    Example:
        from mcpbundles_app_ui import App, LightTheme, Stats, Stat, Card

        class ActivityHub(App):
            name = "Activity Hub"
            subtitle = "Engagement analytics"
            theme = LightTheme(accent="#3b82f6")
            layout = [
                Stats(Stat("preview.total", "Total", primary=True)),
                Card(title="Select a view"),
            ]
            custom_head = Path(__file__).parent / "assets/head.html"
            custom_scripts = Path(__file__).parent / "assets/scripts.js"
    """

    name: ClassVar[str] = "App"
    layout: ClassVar[list] = []

    subtitle: ClassVar[Optional[str]] = None
    theme: ClassVar[Optional["Theme"]] = None  # noqa: F821 - forward ref

    custom_head: ClassVar[Optional[Union[str, Path]]] = None
    custom_scripts: ClassVar[Optional[Union[str, Path]]] = None

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
        )

    @classmethod
    def to_html(cls) -> str:
        """Class method alternative to render()."""
        return cls().render()
