#!/usr/bin/env python3
"""Audit whether the PostgreSQL live-baseline candidate is ready for adoption review."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_live_baseline_candidate as live_candidate  # noqa: E402

DEFAULT_CANDIDATE_ROOT = live_candidate.DEFAULT_CANDIDATE_ROOT
DEFAULT_MANIFEST = live_candidate.DEFAULT_MANIFEST


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _find_migration_dirs(candidate_root: Path) -> list[Path]:
    migrations_root = candidate_root / "migrations"
    if not migrations_root.exists():
        return []
    return sorted(
        [path for path in migrations_root.iterdir() if path.is_dir()],
        key=lambda path: path.name,
    )


def evaluate_live_baseline_adoption_readiness(
    env: Mapping[str, str],
    *,
    candidate_root: Path = DEFAULT_CANDIDATE_ROOT,
    manifest_name: str = DEFAULT_MANIFEST,
) -> tuple[list[str], int]:
    del env
    messages = ["PostgreSQL live baseline adoption audit"]
    failures = 0

    if candidate_root.exists():
        messages.append(
            _format("PASS", f"live baseline candidate exists at {candidate_root}")
        )
    else:
        failures += 1
        messages.append(
            _format("FAIL", f"live baseline candidate missing at {candidate_root}")
        )
        return messages, failures

    readme = candidate_root / "README.md"
    if readme.exists():
        messages.append(_format("PASS", f"candidate README present at {readme}"))
    else:
        failures += 1
        messages.append(_format("FAIL", "candidate README missing"))

    manifest_path = candidate_root / manifest_name
    if not manifest_path.exists():
        failures += 1
        messages.append(_format("FAIL", f"legacy manifest missing at {manifest_path}"))
    else:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            failures += 1
            messages.append(_format("FAIL", "legacy manifest is not valid JSON"))
        else:
            if manifest.get("strategy") == "fresh-baseline-cutover":
                messages.append(
                    _format(
                        "PASS", "legacy manifest strategy is fresh-baseline-cutover"
                    )
                )
            else:
                failures += 1
                messages.append(
                    _format(
                        "FAIL",
                        (
                            "legacy manifest strategy does not match "
                            "fresh-baseline-cutover"
                        ),
                    )
                )
            legacy = manifest.get("legacy_sqlite_migrations")
            if isinstance(legacy, list):
                messages.append(
                    _format(
                        "PASS",
                        f"legacy manifest records {len(legacy)} SQLite migration(s)",
                    )
                )
            else:
                failures += 1
                messages.append(
                    _format("FAIL", "legacy manifest is missing SQLite migration list")
                )

    lock_file = candidate_root / "migrations" / "migration_lock.toml"
    if not lock_file.exists():
        failures += 1
        messages.append(_format("FAIL", "candidate migration_lock.toml missing"))
    else:
        text = lock_file.read_text(encoding="utf-8")
        if 'provider = "postgresql"' in text:
            messages.append(
                _format("PASS", "candidate migration lock targets PostgreSQL")
            )
        else:
            failures += 1
            messages.append(
                _format("FAIL", "candidate migration lock does not target PostgreSQL")
            )

    migration_dirs = _find_migration_dirs(candidate_root)
    if not migration_dirs:
        failures += 1
        messages.append(_format("FAIL", "candidate contains no migration directories"))
        return messages, failures

    messages.append(
        _format(
            "PASS",
            f"candidate contains {len(migration_dirs)} baseline migration draft(s)",
        )
    )

    latest = migration_dirs[-1]
    migration_sql = latest / "migration.sql"
    if not migration_sql.exists():
        failures += 1
        messages.append(
            _format("FAIL", f"candidate migration SQL missing in {latest.name}")
        )
    else:
        sql = migration_sql.read_text(encoding="utf-8").strip()
        if sql:
            messages.append(
                _format("PASS", f"candidate migration SQL populated in {latest.name}")
            )
        else:
            failures += 1
            messages.append(
                _format("FAIL", f"candidate migration SQL empty in {latest.name}")
            )

    return messages, failures


def main() -> int:
    messages, failures = evaluate_live_baseline_adoption_readiness(os.environ)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
