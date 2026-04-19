from __future__ import annotations

from pathlib import Path

import yaml

from .models import DocumentProfile, Theme


def _load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Profile at {path} must be a mapping.")
    return data


def load_profile(path: Path) -> DocumentProfile:
    data = _load_yaml(path)
    theme_data = data.pop("theme", {}) or {}
    theme = Theme(**theme_data)
    return DocumentProfile(theme=theme, **data)
