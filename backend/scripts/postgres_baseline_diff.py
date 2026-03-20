#!/usr/bin/env python3
"""Render a PostgreSQL Prisma baseline SQL script from the current schema."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path
from typing import Callable, Mapping, Sequence

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_schema_variant as schema_variant  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
DEFAULT_SCHEMA_OUTPUT = BACKEND_DIR / "prisma/schema.postgres.prisma"
DEFAULT_BASELINE_OUTPUT = BACKEND_DIR / "prisma/postgres-baseline.sql"
SHADOW_DATABASE_ENV = "POSTGRES_SHADOW_DATABASE_URL"

CommandRunner = Callable[
    [Sequence[str], Path, Mapping[str, str]], subprocess.CompletedProcess
]


def evaluate_baseline_diff_readiness(
    env: Mapping[str, str],
    *,
    which: Callable[[str], str | None] = shutil.which,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL baseline diff readiness"]
    failures = 0

    if which("prisma"):
        messages.append("PASS prisma CLI is available")
    else:
        failures += 1
        messages.append("FAIL prisma CLI is required to render baseline SQL")

    if schema_variant.DEFAULT_INPUT.exists():
        messages.append(
            f"PASS source Prisma schema available at {schema_variant.DEFAULT_INPUT}"
        )
    else:
        failures += 1
        messages.append("FAIL source Prisma schema is missing")

    shadow_url = env.get(SHADOW_DATABASE_ENV) or env.get("DATABASE_URL")
    if shadow_url:
        messages.append(
            (
                f"PASS using `{SHADOW_DATABASE_ENV}`/`DATABASE_URL` "
                "context for schema rendering"
            )
        )
    else:
        messages.append(
            f"WARN neither {SHADOW_DATABASE_ENV} nor DATABASE_URL is set; "
            "schema rendering will still work, but follow-up validation may not"
        )

    return messages, failures


def build_baseline_diff_command(
    *,
    schema_output: Path = DEFAULT_SCHEMA_OUTPUT,
    prisma_bin: str = "prisma",
) -> list[str]:
    return [
        prisma_bin,
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema-datamodel",
        str(schema_output),
        "--script",
    ]


def render_baseline_diff(
    env: Mapping[str, str],
    *,
    schema_output: Path = DEFAULT_SCHEMA_OUTPUT,
    output_path: Path = DEFAULT_BASELINE_OUTPUT,
    run_command: CommandRunner | None = None,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL baseline diff"]
    rendered_schema, replacements = schema_variant.write_postgres_schema_variant(
        target=schema_output,
        url_env_var=SHADOW_DATABASE_ENV,
    )
    if replacements:
        messages.append(f"PASS rendered PostgreSQL schema variant to {rendered_schema}")
    else:
        messages.append(
            "WARN schema variant renderer did not rewrite a sqlite provider marker"
        )

    command = build_baseline_diff_command(schema_output=schema_output)
    runner = run_command or (
        lambda cmd, cwd, command_env: subprocess.run(
            cmd,
            cwd=cwd,
            env=dict(command_env),
            capture_output=True,
            text=True,
            check=False,
        )
    )
    merged_env = dict(os.environ)
    merged_env.update(env)
    result = runner(command, BACKEND_DIR, merged_env)
    if result.returncode != 0:
        messages.append(
            f"FAIL prisma migrate diff exited with code {result.returncode}"
        )
        stderr = (result.stderr or "").strip()
        if stderr:
            messages.append(stderr)
        return messages, result.returncode

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result.stdout, encoding="utf-8")
    messages.append(f"PASS wrote PostgreSQL baseline SQL to {output_path}")
    return messages, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--schema-output",
        type=Path,
        default=DEFAULT_SCHEMA_OUTPUT,
        help="Where to render the PostgreSQL schema variant before diffing.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_BASELINE_OUTPUT,
        help="Where to write the generated PostgreSQL baseline SQL script.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the Prisma migrate diff and write the baseline SQL file.",
    )
    args = parser.parse_args()

    readiness_messages, failures = evaluate_baseline_diff_readiness(os.environ)
    for message in readiness_messages:
        print(message)
    print()

    command = build_baseline_diff_command(schema_output=args.schema_output)
    print("Baseline diff command")
    print("- " + " ".join(command))

    if failures:
        return 1

    if not args.run:
        print()
        print("Dry run only. Re-run with --run to write the PostgreSQL baseline SQL.")
        return 0

    messages, exit_code = render_baseline_diff(
        os.environ,
        schema_output=args.schema_output,
        output_path=args.output,
    )
    for message in messages:
        print(message)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
