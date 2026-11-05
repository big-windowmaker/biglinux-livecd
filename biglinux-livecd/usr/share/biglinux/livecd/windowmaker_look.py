"""Window Maker look of the setup wizard, for the Big WindowMaker edition.

The live session runs the wizard before Window Maker starts, with no window
manager at all, and libadwaita ignores GTK themes. So the NeXTSTEP look (grey
bevelled surfaces, the dark title bar, square raised buttons) is drawn by the
wizard's own CSS: style-windowmaker.css holds the rules and one palette file
per variant defines the colours they use, which lets the wizard swap light and
dark while it runs. Nothing here applies to the other editions.

This module stays free of GTK so the tests can import it.
"""

from __future__ import annotations

import os

DESKTOP_ENVIRONMENT = "WindowMaker"
VARIANTS = ("light", "dark")
DEFAULT_VARIANT = "light"

LIVECD_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_STYLESHEET = "style-windowmaker.css"
PALETTE_STYLESHEETS = {
    "light": "style-windowmaker-light.css",
    "dark": "style-windowmaker-dark.css",
}

# Installed by big-wm-themes (big-wm/Makefile) from themes/logo/big-wm.svg.
LOGO_PATH = "/usr/share/icons/hicolor/scalable/apps/big-wm.svg"
TITLE = "Big WindowMaker"


def is_windowmaker(desktop_environment: str) -> bool:
    return desktop_environment == DESKTOP_ENVIRONMENT


def normalize_variant(value: str | None) -> str:
    """Map anything but an exact "light" or "dark" to the default variant."""
    if value is None:
        return DEFAULT_VARIANT
    value = value.strip()
    return value if value in VARIANTS else DEFAULT_VARIANT


def stylesheet_paths(variant: str, base_dir: str = LIVECD_DIR) -> tuple[str, str]:
    """Return the rules stylesheet and the palette of one variant."""
    if variant not in VARIANTS:
        raise ValueError(f"unknown Window Maker look variant: {variant!r}")
    return (
        os.path.join(base_dir, BASE_STYLESHEET),
        os.path.join(base_dir, PALETTE_STYLESHEETS[variant]),
    )


def logo_path(fallback: str, installed: str = LOGO_PATH) -> str:
    """Prefer the Big WindowMaker logo; keep the previous logo without it."""
    return installed if os.path.isfile(installed) else fallback
