"""Helpers for running backend scripts directly."""

from __future__ import annotations

import sys
from pathlib import Path


def ensure_backend_import_path() -> Path:
    """Ensure the backend package root is importable for direct script runs."""
    backend_root = Path(__file__).resolve().parents[1]
    backend_root_str = str(backend_root)
    if backend_root_str not in sys.path:
        sys.path.insert(0, backend_root_str)
    return backend_root
