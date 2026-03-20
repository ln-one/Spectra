#!/usr/bin/env python3
"""Render a PostgreSQL-ready Prisma schema variant without mutating the main one."""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "backend/prisma/schema.prisma"
DEFAULT_OUTPUT = ROOT / "backend/prisma/schema.postgres.prisma"
SQLITE_PROVIDER = 'provider = "sqlite"'
POSTGRES_PROVIDER = 'provider = "postgresql"'


def render_postgres_schema_variant(schema_text: str) -> tuple[str, int]:
    replacements = schema_text.count(SQLITE_PROVIDER)
    if replacements == 0:
        return schema_text, 0
    return schema_text.replace(SQLITE_PROVIDER, POSTGRES_PROVIDER, 1), replacements


def write_postgres_schema_variant(
    source: Path = DEFAULT_INPUT,
    target: Path = DEFAULT_OUTPUT,
) -> tuple[Path, int]:
    schema_text = source.read_text(encoding="utf-8")
    rendered, replacements = render_postgres_schema_variant(schema_text)
    target.write_text(rendered, encoding="utf-8")
    return target, replacements


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_INPUT,
        help="Source Prisma schema file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output PostgreSQL schema variant path",
    )
    args = parser.parse_args()

    output_path, replacements = write_postgres_schema_variant(
        source=args.source,
        target=args.output,
    )
    print(f"Rendered PostgreSQL schema variant to {output_path}")
    if replacements:
        print("PASS datasource provider was rewritten from sqlite to postgresql")
        return 0

    print("WARN source schema did not contain a sqlite datasource provider marker")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
