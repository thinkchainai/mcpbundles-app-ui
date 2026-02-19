"""
Theme system for MCP App UI styling.

Provides light and dark themes with customizable accent colors.
"""

from .base import Theme
from .light import LightTheme
from .dark import DarkTheme

__all__ = ["Theme", "LightTheme", "DarkTheme"]
