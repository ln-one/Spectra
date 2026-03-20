#!/usr/bin/env python3
"""Prepare or apply fresh-baseline PostgreSQL migration adoption."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import (  # noqa: E402
    postgres_live_baseline_adoption_audit as adoption_audit,
)
from scripts import postgres_live_baseline_candidate as live_candidate  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LIVE_MIGRATIONS_ROOT = ROOT / "backend/prisma/migrations"
DEFAULT_ARCHIVE_ROOT = ROOT / "backend/prisma/sqlite-migrations-archive"


def _copy_tree(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for path in src.iterdir():
        target = dst / path.name
        if path.is_dir():
            shutil.copytree(path, target)
        else:
            shutil.copy2(path, target)


def _iter_live_entries(root: Path) -> list[str]:
    if not root.exists():
        return []
    return sorted(path.name for path in root.iterdir() if path.name)


def build_adoption_tag() -> str:
    return datetime.now(UTC).strftime("adopted-%Y%m%dT%H%M%SZ")


def adopt_live_baseline(
    env: Mapping[str, str],
    *,
    candidate_root: Path = live_candidate.DEFAULT_CANDIDATE_ROOT,
    live_migrations_root: Path = LIVE_MIGRATIONS_ROOT,
    archive_root: Path = DEFAULT_ARCHIVE_ROOT,
    adoption_tag: str | None = None,
    apply: bool = False,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL live baseline adoption"]

    audit_messages, audit_failures = (
        adoption_audit.evaluate_live_baseline_adoption_readiness(
            env, candidate_root=candidate_root
        )
    )
    messages.extend(f"[audit] {message}" for message in audit_messages[1:])
    if audit_failures:
        return messages, audit_failures

    tag = adoption_tag or build_adoption_tag()
    archive_dir = archive_root / tag
    candidate_migrations = candidate_root / "migrations"
    archive_manifest = archive_dir / "archive-manifest.json"

    live_entries = _iter_live_entries(live_migrations_root)
    candidate_entries = _iter_live_entries(candidate_migrations)

    messages.append(
        f"PASS live migrations currently contain {len(live_entries)} entrie(s)"
    )
    messages.append(
        f"PASS candidate migrations contain {len(candidate_entries)} entrie(s)"
    )
    messages.append(f"PASS archive target prepared at {archive_dir}")
    messages.append(
        "PASS adoption would replace "
        f"{live_migrations_root} from {candidate_migrations}"
    )

    if not apply:
        messages.append("Dry run only. Re-run with --run to apply adoption.")
        return messages, 0

    archive_dir.mkdir(parents=True, exist_ok=True)
    if live_migrations_root.exists():
        _copy_tree(live_migrations_root, archive_dir / "migrations")

    archive_manifest.write_text(
        json.dumps(
            {
                "strategy": "fresh-baseline-cutover",
                "adoption_tag": tag,
                "archived_live_entries": live_entries,
                "candidate_source": str(candidate_root),
                "note": (
                    "Legacy SQLite migration history was archived before adopting "
                    "the PostgreSQL live baseline candidate."
                ),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    if live_migrations_root.exists():
        shutil.rmtree(live_migrations_root)
    shutil.copytree(candidate_migrations, live_migrations_root)

    messages.append(f"PASS archived prior live migrations to {archive_dir}")
    messages.append(
        f"PASS adopted PostgreSQL baseline candidate into {live_migrations_root}"
    )
    return messages, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--candidate-root",
        type=Path,
        default=live_candidate.DEFAULT_CANDIDATE_ROOT,
        help="Fresh-baseline live candidate directory.",
    )
    parser.add_argument(
        "--archive-root",
        type=Path,
        default=DEFAULT_ARCHIVE_ROOT,
        help="Where to archive the pre-adoption live migrations.",
    )
    parser.add_argument(
        "--tag",
        default=None,
        help="Optional archive tag for deterministic adoption runs.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Apply adoption instead of only printing the plan.",
    )
    args = parser.parse_args()

    print("PostgreSQL live baseline adoption")
    print(f"candidate_root={args.candidate_root}")
    print(f"archive_root={args.archive_root}")
    if args.tag:
        print(f"tag={args.tag}")
    if not args.run:
        print("Dry run only. Re-run with --run to apply adoption.")
        return 0

    messages, exit_code = adopt_live_baseline(
        {},
        candidate_root=args.candidate_root,
        archive_root=args.archive_root,
        adoption_tag=args.tag,
        apply=args.run,
    )
    for message in messages:
        print(message)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
