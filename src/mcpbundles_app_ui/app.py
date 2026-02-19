"""
Base App class for declarative MCP App UI definitions.
"""

from typing import TYPE_CHECKING, ClassVar, Optional

from .renderer import AppRenderer

if TYPE_CHECKING:
    from .themes import Theme


class App:
    """
    Base class for MCP App UI definitions.

    Subclasses define:
        - name: App title
        - subtitle: Optional description
        - theme: Theme instance (from themes module)
        - layout: List of components to render

    Example:
        class ActivityHub(App):
            name = "Activity Hub"
            subtitle = "Engagement analytics"
            theme = LightTheme(accent="#3b82f6")
            layout = [
                Stats(...),
                Chart.bar(...),
            ]
    """

    name: ClassVar[str] = "App"
    layout: ClassVar[list] = []

    subtitle: ClassVar[Optional[str]] = None
    theme: ClassVar[Optional["Theme"]] = None  # noqa: F821 - forward ref

    custom_head: ClassVar[Optional[str]] = None
    custom_scripts: ClassVar[Optional[str]] = None

    def __init__(self):
        pass

    def render(self) -> str:
        """
        Generate complete HTML document for this app.

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
            custom_head=self.custom_head,
            custom_scripts=self.custom_scripts,
        )

    @classmethod
    def to_html(cls) -> str:
        """Class method alternative to render()."""
        return cls().render()
