"""Helpers for preferring the freshest generated Prisma client at runtime."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _is_postgres_generated_client(site_packages: Path) -> bool:
    schema = site_packages / "prisma" / "schema.prisma"
    if not schema.exists():
        return False
    content = schema.read_text(encoding="utf-8")
    return 'provider = "postgresql"' in content


def _candidate_site_packages() -> list[Path]:
    version = f"python{sys.version_info.major}.{sys.version_info.minor}"
    home = Path.home()
    candidates = []

    override = os.getenv("SPECTRA_PRISMA_CLIENT_SITE_PACKAGES")
    if override:
        candidates.append(Path(override).expanduser())

    candidates.append(
        home
        / ".local"
        / "pipx"
        / "venvs"
        / "prisma"
        / "lib"
        / version
        / "site-packages"
    )
    candidates.append(
        home
        / "Library"
        / "Python"
        / f"{sys.version_info.major}.{sys.version_info.minor}"
        / "lib"
        / "python"
        / "site-packages"
    )
    return candidates


def ensure_generated_prisma_client_path() -> Path | None:
    """Put the freshest generated PostgreSQL prisma client first on sys.path."""

    for site_packages in _candidate_site_packages():
        if not _is_postgres_generated_client(site_packages):
            continue
        site_packages_str = str(site_packages)
        if site_packages_str not in sys.path:
            sys.path.insert(0, site_packages_str)
        return site_packages
    return None
