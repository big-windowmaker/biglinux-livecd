"""Read the profile materialized by the live-session launcher."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def load_profile() -> dict[str, Any]:
    profile_directory = Path(
        os.environ.get("CALAMARES_PROFILE_DIRECTORY", "/etc/calamares")
    )
    profile_file = profile_directory / "profile.json"
    try:
        data = json.loads(profile_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}

    profile_id = profile_directory.name or "biglinux"
    display_name = data.get("display_name")
    return {
        "id": data.get("id", profile_id),
        "display_name": display_name if isinstance(display_name, str) else profile_id,
    }


def load_about() -> dict[str, Any]:
    """The edition's own "About" (profile.json "about"), or {}.

    Editions without it keep the BigLinux defaults of app.py."""
    profile_directory = Path(
        os.environ.get("CALAMARES_PROFILE_DIRECTORY", "/etc/calamares")
    )
    try:
        data = json.loads(
            (profile_directory / "profile.json").read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return {}
    about = data.get("about") if isinstance(data, dict) else None
    return about if isinstance(about, dict) else {}
