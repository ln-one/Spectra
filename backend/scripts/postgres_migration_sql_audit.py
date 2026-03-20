#!/usr/bin/env python3
"""Audit existing Prisma migration SQL for SQLite-specific constructs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = ROOT / "backend/prisma/migrations"


@dataclass(frozen=True)
class SqlPattern:
    name: str
    needle: str
    message: str


SQLITE_SPECIFIC_PATTERNS = (
    SqlPattern(
        name="pragma",
        needle="PRAGMA ",
        message="contains SQLite PRAGMA statements",
    ),
    SqlPattern(
        name="table_rewrite_rename",
        needle='ALTER TABLE "new_',
        message="uses SQLite-style table rewrite rename flow",
    ),
)


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _migration_sql_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*/migration.sql"))


def evaluate_migration_sql() -> tuple[list[str], int]:
    messages = ["PostgreSQL migration SQL audit"]
    failures = 0

    files = _migration_sql_files()
    if not files:
        messages.append(_format("WARN", "no Prisma migration SQL files found"))
        return messages, failures

    total_hits = 0
    for path in files:
        text = path.read_text(encoding="utf-8")
        path_hits = []
        for pattern in SQLITE_SPECIFIC_PATTERNS:
            count = text.count(pattern.needle)
            if count:
                total_hits += count
                path_hits.append(f"{pattern.message} ({count} hit(s))")

        if path_hits:
            messages.append(
                _format(
                    "WARN",
                    f"{path.relative_to(ROOT)} " + "; ".join(path_hits),
                )
            )
        else:
            messages.append(
                _format(
                    "PASS",
                    (
                        f"{path.relative_to(ROOT)} has no SQLite-specific "
                        "migration markers"
                    ),
                )
            )

    if total_hits:
        messages.append(
            _format(
                "WARN",
                (
                    "existing Prisma migrations still encode SQLite-specific SQL; "
                    "prepare a PostgreSQL baseline migration path before cutover"
                ),
            )
        )
    else:
        messages.append(
            _format(
                "PASS",
                "existing Prisma migration SQL looks portable for PostgreSQL cutover",
            )
        )

    return messages, failures


def main() -> int:
    messages, failures = evaluate_migration_sql()
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
