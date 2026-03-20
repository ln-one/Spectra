#!/usr/bin/env python3
"""Validate the PostgreSQL Prisma shadow path end to end."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path
from typing import Callable, Mapping, Sequence
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
SCHEMA_RENDERER = BACKEND_DIR / "scripts/postgres_schema_variant.py"
DEFAULT_SCHEMA_OUTPUT = BACKEND_DIR / "prisma/schema.postgres.prisma"
SHADOW_DATABASE_ENV = "POSTGRES_SHADOW_DATABASE_URL"

CommandRunner = Callable[[Sequence[str], Path, Mapping[str, str]], int]


def _is_postgres_url(value: str | None) -> bool:
    parsed = urlparse((value or "").strip())
    return parsed.scheme == "postgresql"


def evaluate_shadow_prisma_readiness(
    env: Mapping[str, str],
    *,
    which: Callable[[str], str | None] = shutil.which,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL shadow Prisma validation readiness"]
    failures = 0

    shadow_url = env.get(SHADOW_DATABASE_ENV) or env.get("DATABASE_URL")
    if _is_postgres_url(shadow_url):
        messages.append(
            f"PASS {SHADOW_DATABASE_ENV} or DATABASE_URL uses "
            "a PostgreSQL-compatible scheme"
        )
    else:
        failures += 1
        messages.append(
            f"FAIL {SHADOW_DATABASE_ENV} (or fallback DATABASE_URL) "
            "must point to a PostgreSQL shadow database"
        )

    prisma_bin = which("prisma")
    if prisma_bin:
        messages.append(f"PASS prisma CLI resolved at {prisma_bin}")
    else:
        failures += 1
        messages.append("FAIL prisma CLI is required for shadow Prisma validation")

    if SCHEMA_RENDERER.exists():
        messages.append(f"PASS schema renderer available at {SCHEMA_RENDERER}")
    else:
        failures += 1
        messages.append("FAIL postgres schema renderer script is missing")

    return messages, failures


def build_shadow_prisma_commands(
    *,
    schema_output: Path = DEFAULT_SCHEMA_OUTPUT,
    python_bin: str = "python3",
    prisma_bin: str = "prisma",
) -> list[list[str]]:
    return [
        [
            python_bin,
            str(SCHEMA_RENDERER),
            "--output",
            str(schema_output),
            "--url-env-var",
            SHADOW_DATABASE_ENV,
        ],
        [
            prisma_bin,
            "validate",
            f"--schema={schema_output}",
        ],
        [
            prisma_bin,
            "db",
            "push",
            f"--schema={schema_output}",
            "--skip-generate",
            "--accept-data-loss",
        ],
        [
            prisma_bin,
            "generate",
            f"--schema={schema_output}",
        ],
    ]


def execute_shadow_prisma_validation(
    env: Mapping[str, str],
    *,
    schema_output: Path = DEFAULT_SCHEMA_OUTPUT,
    run_command: CommandRunner | None = None,
) -> tuple[list[list[str]], int]:
    commands = build_shadow_prisma_commands(schema_output=schema_output)

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
    if SHADOW_DATABASE_ENV not in merged_env and merged_env.get("DATABASE_URL"):
        merged_env[SHADOW_DATABASE_ENV] = merged_env["DATABASE_URL"]

    exit_code = 0
    try:
        for command in commands:
            exit_code = runner(command, BACKEND_DIR, merged_env)
            if exit_code != 0:
                return commands, exit_code
        return commands, 0
    finally:
        if schema_output == DEFAULT_SCHEMA_OUTPUT:
            restore_command = ["prisma", "generate", "--schema=prisma/schema.prisma"]
            runner(restore_command, BACKEND_DIR, dict(os.environ))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_SCHEMA_OUTPUT,
        help="Where to render the PostgreSQL Prisma schema variant.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute validate/db push/generate against the PostgreSQL shadow DB.",
    )
    args = parser.parse_args()

    readiness_messages, failures = evaluate_shadow_prisma_readiness(os.environ)
    for message in readiness_messages:
        print(message)
    print()

    commands = build_shadow_prisma_commands(schema_output=args.output)
    print("Shadow Prisma command chain")
    for command in commands:
        print("- " + " ".join(command))

    if failures:
        return 1

    if not args.run:
        print()
        print("Dry run only. Re-run with --run to execute the Prisma shadow flow.")
        return 0

    _, exit_code = execute_shadow_prisma_validation(
        os.environ,
        schema_output=args.output,
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
