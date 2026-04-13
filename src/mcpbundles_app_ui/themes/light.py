"""
Light theme with neutral defaults.

Customizable accent color, fonts, and all design tokens.
"""

from .base import Theme


class LightTheme(Theme):
    """
    Light theme with neutral defaults.

    Usage:
        class MyApp(App):
            theme = LightTheme()  # Blue accent by default
            # Or with custom accent:
            theme = LightTheme(accent="#f97316")  # Orange accent
    """

    def __init__(self, accent: str = "#3b82f6", **kwargs):  # noqa: D107
        defaults = dict(
            accent=accent,
            bg_page="#ffffff",
            bg_card="#ffffff",
            bg_hover="#f4f4f5",
            text_primary="#09090b",
            text_secondary="#3f3f46",
            text_muted="#71717a",
            border="#e4e4e7",
            border_focus="#d4d4d8",
            success="#22c55e",
            warning="#f59e0b",
            error="#ef4444",
            chart_colors=[
                "#3b82f6",
                "#06b6d4",
                "#8b5cf6",
                "#22c55e",
                "#f59e0b",
                "#ec4899",
                "#f97316",
                "#10b981",
            ],
            font_family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            font_family_mono="'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
            shadow_sm="0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            shadow_md="0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
            shadow_lg="0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
            radius_sm="calc(0.5rem - 4px)",
            radius_md="calc(0.5rem - 2px)",
            radius_lg="0.5rem",
            font_url=None,
        )
        defaults.update(kwargs)
        super().__init__(**defaults)

    def get_css_variables(self) -> str:
        """Generate CSS custom properties."""
        accent_soft = self._hex_to_rgba(self.accent, 0.1)
        accent_medium = self._hex_to_rgba(self.accent, 0.2)

        font_display = "'Outfit', system-ui, sans-serif" if self.font_url and "Outfit" in self.font_url else "system-ui, sans-serif"

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
  --background: {self.bg_page};
  --card: {self.bg_card};
  --muted: {self.bg_hover};

  /* Text (private — base.css bridges host tokens to --text-*) */
  --_text-primary: {self.text_primary};
  --_text-secondary: {self.text_secondary};
  --_text-muted: {self.text_muted};
  --foreground: {self.text_primary};
  --muted-foreground: {self.text_muted};

  /* Borders (private — base.css bridges host tokens to --border) */
  --_border: {self.border};
  --border-focus: {self.border_focus};
  --input: {self.border};

  /* Status */
  --success: {self.success};
  --warning: {self.warning};
  --error: {self.error};
  --destructive: {self.error};

  /* Chart palette */
  --chart-1: {self.chart_colors[0] if len(self.chart_colors) > 0 else self.accent};
  --chart-2: {self.chart_colors[1] if len(self.chart_colors) > 1 else self.accent};
  --chart-3: {self.chart_colors[2] if len(self.chart_colors) > 2 else self.accent};
  --chart-4: {self.chart_colors[3] if len(self.chart_colors) > 3 else self.accent};
  --chart-5: {self.chart_colors[4] if len(self.chart_colors) > 4 else self.accent};
  --chart-6: {self.chart_colors[5] if len(self.chart_colors) > 5 else self.accent};

  /* Typography (private — base.css bridges host --font-sans to --font-family) */
  --_font-family: {self.font_family};
  --font-display: {font_display};
  --font-mono: {self.font_family_mono};

  /* Shadows */
  --shadow-sm: {self.shadow_sm};
  --shadow-md: {self.shadow_md};
  --shadow-lg: {self.shadow_lg};

  /* Radius */
  --radius: 0.5rem;
  --radius-sm: {self.radius_sm};
  --radius-md: {self.radius_md};
  --radius-lg: {self.radius_lg};
}}
"""
