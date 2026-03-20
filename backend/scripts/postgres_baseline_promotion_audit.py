#!/usr/bin/env python3
"""Audit whether the PostgreSQL baseline draft package is ready for promotion."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_baseline_package as baseline_package  # noqa: E402

DEFAULT_PACKAGE_ROOT = baseline_package.DEFAULT_PACKAGE_ROOT


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _find_migration_dirs(package_root: Path) -> list[Path]:
    migrations_root = package_root / "migrations"
    if not migrations_root.exists():
        return []
    return sorted(
        [path for path in migrations_root.iterdir() if path.is_dir()],
        key=lambda path: path.name,
    )


def evaluate_baseline_promotion_readiness(
    env: Mapping[str, str],
    *,
    package_root: Path = DEFAULT_PACKAGE_ROOT,
) -> tuple[list[str], int]:
    del env
    messages = ["PostgreSQL baseline promotion audit"]
    failures = 0

    if package_root.exists():
        messages.append(
            _format("PASS", f"baseline package root exists at {package_root}")
        )
    else:
        failures += 1
        messages.append(
            _format("FAIL", f"baseline package root missing at {package_root}")
        )
        return messages, failures

    readme = package_root / "README.md"
    if readme.exists():
        messages.append(_format("PASS", f"baseline package README present at {readme}"))
    else:
        failures += 1
        messages.append(_format("FAIL", "baseline package README missing"))

    lock_file = package_root / "migrations" / "migration_lock.toml"
    if not lock_file.exists():
        failures += 1
        messages.append(_format("FAIL", "baseline package migration_lock.toml missing"))
    else:
        text = lock_file.read_text(encoding="utf-8")
        if 'provider = "postgresql"' in text:
            messages.append(
                _format("PASS", "baseline package migration lock targets PostgreSQL")
            )
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    "baseline package migration lock does not target PostgreSQL",
                )
            )

    migration_dirs = _find_migration_dirs(package_root)
    if not migration_dirs:
        failures += 1
        messages.append(
            _format("FAIL", "baseline package contains no migration directories")
        )
        return messages, failures

    messages.append(
        _format(
            "PASS",
            f"baseline package contains {len(migration_dirs)} migration draft(s)",
        )
    )

    latest = migration_dirs[-1]
    migration_sql = latest / "migration.sql"
    if not migration_sql.exists():
        failures += 1
        messages.append(
            _format("FAIL", f"baseline migration SQL missing in {latest.name}")
        )
    else:
        sql = migration_sql.read_text(encoding="utf-8").strip()
        if sql:
            messages.append(
                _format("PASS", f"baseline migration SQL populated in {latest.name}")
            )
        else:
            failures += 1
            messages.append(
                _format("FAIL", f"baseline migration SQL empty in {latest.name}")
            )

    return messages, failures


def main() -> int:
    messages, failures = evaluate_baseline_promotion_readiness(os.environ)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
