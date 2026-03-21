"""Lightweight env bootstrap for deployment scripts."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Mapping


def _parse_env_file(path: Path) -> Dict[str, str]:
    parsed: Dict[str, str] = {}
    if not path.exists():
        return parsed

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        parsed[key] = value
    return parsed


def build_script_env(
    *, root: Path | None = None, os_env: Mapping[str, str] | None = None
) -> Dict[str, str]:
    """
    Merge backend/.env into script runtime env.

    Priority:
    1. OS env (highest)
    2. backend/.env
    """
    root_path = root or Path(__file__).resolve().parents[2]
    merged = _parse_env_file(root_path / "backend/.env")
    merged.update(dict(os_env or os.environ))
    return merged
