#!/usr/bin/env python3
"""Scaffold a fresh PostgreSQL live-baseline candidate.

The candidate is generated without mutating the live Prisma migrations tree.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_baseline_package as baseline_package  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LIVE_MIGRATIONS = ROOT / "backend/prisma/migrations"
DEFAULT_CANDIDATE_ROOT = ROOT / "backend/prisma/postgres-live-baseline-candidate"
DEFAULT_MANIFEST = "sqlite-history-manifest.json"


def _iter_legacy_migrations(migrations_root: Path) -> list[str]:
    if not migrations_root.exists():
        return []
    return sorted(
        path.name for path in migrations_root.iterdir() if path.is_dir() and path.name
    )


def scaffold_live_baseline_candidate(
    *,
    candidate_root: Path = DEFAULT_CANDIDATE_ROOT,
    package_root: Path = baseline_package.DEFAULT_PACKAGE_ROOT,
    legacy_migrations_root: Path = LIVE_MIGRATIONS,
    manifest_name: str = DEFAULT_MANIFEST,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL live baseline candidate"]

    package_messages, package_exit = baseline_package.build_baseline_package(
        {}, package_root=package_root
    )
    messages.extend(f"[package] {message}" for message in package_messages[1:])
    if package_exit != 0:
        return messages, package_exit

    migrations_root = candidate_root / "migrations"
    migrations_root.mkdir(parents=True, exist_ok=True)

    source_migrations_root = package_root / "migrations"
    for source in source_migrations_root.iterdir():
        target = migrations_root / source.name
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            for child in source.iterdir():
                if child.is_file():
                    target.joinpath(child.name).write_text(
                        child.read_text(encoding="utf-8"), encoding="utf-8"
                    )
        elif source.is_file():
            target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    legacy_manifest = {
        "strategy": "fresh-baseline-cutover",
        "legacy_sqlite_migrations": _iter_legacy_migrations(legacy_migrations_root),
        "note": (
            "These SQLite migrations are preserved as historical reference only "
            "and are not part of the PostgreSQL live migration chain."
        ),
    }
    (candidate_root / manifest_name).write_text(
        json.dumps(legacy_manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (candidate_root / "README.md").write_text(
        "# PostgreSQL Live Baseline Candidate\n\n"
        "This directory is a fresh-baseline candidate for promoting "
        "PostgreSQL to the live Prisma migration chain.\n\n"
        "It intentionally excludes legacy SQLite migrations from live adoption.\n",
        encoding="utf-8",
    )

    messages.append(f"PASS wrote live candidate to {candidate_root}")
    messages.append(
        "PASS recorded "
        f"{len(legacy_manifest['legacy_sqlite_migrations'])} legacy SQLite migration(s)"
    )
    return messages, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_CANDIDATE_ROOT,
        help="Where to scaffold the live-baseline candidate.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Generate the candidate instead of only printing the target path.",
    )
    args = parser.parse_args()

    print("PostgreSQL live baseline candidate")
    print(f"output_dir={args.output_dir}")
    if not args.run:
        print("Dry run only. Re-run with --run to generate the candidate.")
        return 0

    messages, exit_code = scaffold_live_baseline_candidate(
        candidate_root=args.output_dir
    )
    for message in messages:
        print(message)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
