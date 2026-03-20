"""
Qt/QSS design system tokens.

Solid-hex approximations of the CSS opacity-based tokens in
shared/styles/design-system.css. Qt/QSS does not support rgba()
or CSS variables, so these are pre-computed against the expected
background color.

Keep in sync with design-system.css when token values change.
"""

DARK_TOKENS = {
    "bg_deep": "#141416",
    "bg_canvas": "#1C1C1E",
    "bg_overlay": "#3A3A3C",
    "text_primary": "#EAEAEB",
    "text_secondary": "#8C8C8C",
    "accent": "#0A84FF",
    "border_subtle": "#1F1F21",
    "border_medium": "#2E2E30",
    "green": "#30D158",
    "red": "#FF453A",
}

LIGHT_TOKENS = {
    "bg_deep": "#D8D8DC",
    "bg_canvas": "#E8E7E3",
    "bg_overlay": "#CFCFD3",
    "text_primary": "#1A1A1A",
    "text_secondary": "#6C6C70",
    "accent": "#007AFF",
    "border_subtle": "#CDCDC8",
    "border_medium": "#B8B8B4",
    "green": "#34C759",
    "red": "#FF3B30",
}


def get_tokens(theme="dark"):
    """Get design tokens for the specified theme."""
    return DARK_TOKENS if theme == "dark" else LIGHT_TOKENS
