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
DATABASE_URL_ENV = 'url      = env("DATABASE_URL")'


def render_postgres_schema_variant(
    schema_text: str,
    *,
    url_env_var: str = "DATABASE_URL",
) -> tuple[str, int]:
    replacements = schema_text.count(SQLITE_PROVIDER)
    rendered = schema_text
    if replacements:
        rendered = rendered.replace(SQLITE_PROVIDER, POSTGRES_PROVIDER, 1)
    if url_env_var != "DATABASE_URL":
        rendered = rendered.replace(
            DATABASE_URL_ENV,
            f'url      = env("{url_env_var}")',
            1,
        )
    return rendered, replacements


def write_postgres_schema_variant(
    source: Path = DEFAULT_INPUT,
    target: Path = DEFAULT_OUTPUT,
    *,
    url_env_var: str = "DATABASE_URL",
) -> tuple[Path, int]:
    schema_text = source.read_text(encoding="utf-8")
    rendered, replacements = render_postgres_schema_variant(
        schema_text,
        url_env_var=url_env_var,
    )
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
    parser.add_argument(
        "--url-env-var",
        default="DATABASE_URL",
        help="Datasource env var name to use in the rendered variant.",
    )
    args = parser.parse_args()

    output_path, replacements = write_postgres_schema_variant(
        source=args.source,
        target=args.output,
        url_env_var=args.url_env_var,
    )
    print(f"Rendered PostgreSQL schema variant to {output_path}")
    if replacements:
        print("PASS datasource provider was rewritten from sqlite to postgresql")
        return 0

    if POSTGRES_PROVIDER in output_path.read_text(encoding="utf-8"):
        print("PASS source schema already targets postgresql; variant kept in sync")
        return 0

    print("WARN source schema did not contain a recognized datasource provider marker")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
