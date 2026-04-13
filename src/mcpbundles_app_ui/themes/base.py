"""
Base theme class defining the theme interface.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Theme:
    """
    Base theme configuration.

    Themes define CSS custom properties that control the app appearance.
    Subclasses (LightTheme, DarkTheme) provide sensible defaults.
    """

    accent: str = "#3b82f6"

    bg_page: str = "#ffffff"
    bg_card: str = "#ffffff"
    bg_hover: str = "#f5f5f5"

    text_primary: str = "#171717"
    text_secondary: str = "#525252"
    text_muted: str = "#a3a3a3"

    border: str = "#e5e5e5"
    border_focus: str = "#d4d4d4"

    success: str = "#22c55e"
    warning: str = "#f59e0b"
    error: str = "#ef4444"

    chart_colors: list = field(
        default_factory=lambda: [
            "#3b82f6",
            "#8b5cf6",
            "#06b6d4",
            "#10b981",
            "#f59e0b",
            "#ef4444",
            "#ec4899",
            "#6366f1",
        ]
    )

    font_family: str = "'Inter', system-ui, -apple-system, sans-serif"
    font_family_mono: str = "'JetBrains Mono', 'Fira Code', monospace"

    shadow_sm: str = "0 1px 2px rgba(0, 0, 0, 0.05)"
    shadow_md: str = "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
    shadow_lg: str = "0 10px 15px -3px rgba(0, 0, 0, 0.1)"

    radius_sm: str = "6px"
    radius_md: str = "8px"
    radius_lg: str = "12px"

    font_url: Optional[str] = None

    def get_css_variables(self) -> str:
        """Generate CSS custom properties from theme values."""
        accent_soft = self._hex_to_rgba(self.accent, 0.1)
        accent_medium = self._hex_to_rgba(self.accent, 0.2)

        return f"""
:root {{
  /* Accent */
  --accent: {self.accent};
  --accent-soft: {accent_soft};
  --accent-medium: {accent_medium};

  /* Backgrounds (private — base.css bridges host tokens to --bg-*) */
  --_bg-page: {self.bg_page};
  --_bg-card: {self.bg_card};
  --_bg-hover: {self.bg_hover};
  --bg-main: {self.bg_page};

  /* Text (private — base.css bridges host tokens to --text-*) */
  --_text-primary: {self.text_primary};
  --_text-secondary: {self.text_secondary};
  --_text-muted: {self.text_muted};

  /* Borders (private — base.css bridges host tokens to --border) */
  --_border: {self.border};
  --border-focus: {self.border_focus};

  /* Typography (private — base.css bridges host --font-sans to --font-family) */
  --_font-family: {self.font_family};
  --font-mono: {self.font_family_mono};
  --font-display: {self.font_family};

  /* Status */
  --success: {self.success};
  --warning: {self.warning};
  --error: {self.error};

  /* Chart palette */
  --chart-1: {self.chart_colors[0] if len(self.chart_colors) > 0 else self.accent};
  --chart-2: {self.chart_colors[1] if len(self.chart_colors) > 1 else self.accent};
  --chart-3: {self.chart_colors[2] if len(self.chart_colors) > 2 else self.accent};
  --chart-4: {self.chart_colors[3] if len(self.chart_colors) > 3 else self.accent};
  --chart-5: {self.chart_colors[4] if len(self.chart_colors) > 4 else self.accent};
  --chart-6: {self.chart_colors[5] if len(self.chart_colors) > 5 else self.accent};

  /* Shadows */
  --shadow-sm: {self.shadow_sm};
  --shadow-md: {self.shadow_md};
  --shadow-lg: {self.shadow_lg};

  /* Radius */
  --radius-sm: {self.radius_sm};
  --radius-md: {self.radius_md};
  --radius-lg: {self.radius_lg};
  --radius: {self.radius_md};
}}
"""

    def _hex_to_rgba(self, hex_color: str, alpha: float) -> str:
        """Convert hex color to rgba with alpha."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join([c * 2 for c in hex_color])
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return f"rgba({r}, {g}, {b}, {alpha})"
