#!/usr/bin/env python3
"""Validate the live PostgreSQL Prisma path against the main schema."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path
from typing import Callable, Mapping, Sequence
from urllib.parse import urlparse

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from services import runtime_env  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
MAIN_SCHEMA = BACKEND_DIR / "prisma/schema.prisma"

CommandRunner = Callable[[Sequence[str], Path, Mapping[str, str]], int]


def _is_postgres_url(value: str | None) -> bool:
    parsed = urlparse((value or "").strip())
    return parsed.scheme == "postgresql"


def evaluate_live_prisma_readiness(
    env: Mapping[str, str],
    *,
    which: Callable[[str], str | None] = shutil.which,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL live Prisma validation readiness"]
    failures = 0

    database_url = runtime_env.normalize_database_url(
        env.get("DATABASE_URL"),
        inside_container=Path("/.dockerenv").exists(),
    )
    if _is_postgres_url(database_url):
        messages.append("PASS DATABASE_URL uses a PostgreSQL-compatible scheme")
    else:
        failures += 1
        messages.append("FAIL DATABASE_URL must point to the live PostgreSQL database")

    prisma_bin = which("prisma")
    if prisma_bin:
        messages.append(f"PASS prisma CLI resolved at {prisma_bin}")
    else:
        failures += 1
        messages.append("FAIL prisma CLI is required for live Prisma validation")

    if MAIN_SCHEMA.exists():
        messages.append(f"PASS main Prisma schema available at {MAIN_SCHEMA}")
    else:
        failures += 1
        messages.append("FAIL main Prisma schema is missing")

    return messages, failures


def build_live_prisma_commands(
    *,
    schema_path: Path = MAIN_SCHEMA,
    prisma_bin: str = "prisma",
) -> list[list[str]]:
    return [
        [prisma_bin, "validate", f"--schema={schema_path}"],
        [prisma_bin, "migrate", "deploy", f"--schema={schema_path}"],
        [prisma_bin, "generate", f"--schema={schema_path}"],
    ]


def execute_live_prisma_validation(
    env: Mapping[str, str],
    *,
    schema_path: Path = MAIN_SCHEMA,
    run_command: CommandRunner | None = None,
) -> tuple[list[list[str]], int]:
    commands = build_live_prisma_commands(schema_path=schema_path)
    runner = run_command or (
        lambda cmd, cwd, command_env: subprocess.run(
            cmd,
            cwd=cwd,
            env=dict(command_env),
            check=False,
        ).returncode
    )

    merged_env = dict(os.environ)
    merged_env.update(env)
    normalized_database_url = runtime_env.normalize_database_url(
        merged_env.get("DATABASE_URL"),
        inside_container=Path("/.dockerenv").exists(),
    )
    if normalized_database_url:
        merged_env["DATABASE_URL"] = normalized_database_url

    for command in commands:
        exit_code = runner(command, BACKEND_DIR, merged_env)
        if exit_code != 0:
            return commands, exit_code
    return commands, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute validate/migrate-deploy/generate against the live DB.",
    )
    args = parser.parse_args()

    readiness_messages, failures = evaluate_live_prisma_readiness(os.environ)
    for message in readiness_messages:
        print(message)
    print()

    commands = build_live_prisma_commands()
    print("Live Prisma command chain")
    for command in commands:
        print("- " + " ".join(command))

    if failures:
        return 1

    if not args.run:
        print()
        print("Dry run only. Re-run with --run to execute the live Prisma flow.")
        return 0

    _, exit_code = execute_live_prisma_validation(os.environ)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
