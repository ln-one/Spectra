#!/usr/bin/env python3
"""Create a PostgreSQL backup artifact for cutover and recovery drills."""

from __future__ import annotations

import argparse
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Callable, Mapping, Sequence
from urllib.parse import urlparse

CommandRunner = Callable[[Sequence[str]], int]


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _require_postgres_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "postgresql":
        raise ValueError("DATABASE_URL must use a PostgreSQL-compatible scheme")
    return url


def build_backup_path(
    env: Mapping[str, str],
    *,
    now: datetime | None = None,
) -> Path:
    backup_dir = Path((env.get("POSTGRES_BACKUP_DIR") or "").strip())
    if not backup_dir:
        raise ValueError("POSTGRES_BACKUP_DIR must be configured")

    prefix = (env.get("POSTGRES_BACKUP_PREFIX") or "spectra").strip() or "spectra"
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    return backup_dir / f"{prefix}-{stamp}.dump"


def build_backup_command(
    env: Mapping[str, str],
    *,
    output_path: Path,
) -> list[str]:
    database_url = _require_postgres_url((env.get("DATABASE_URL") or "").strip())
    use_docker = _is_truthy(env.get("POSTGRES_BACKUP_USE_DOCKER"))
    if use_docker:
        docker_bin = (env.get("DOCKER_BIN") or "docker").strip() or "docker"
        image = (env.get("POSTGRES_TOOLCHAIN_IMAGE") or "postgres:16-alpine").strip()
        return [
            docker_bin,
            "run",
            "--rm",
            "-e",
            f"DATABASE_URL={database_url}",
            "-v",
            f"{output_path.parent}:{output_path.parent}",
            image,
            "pg_dump",
            database_url,
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            "--file",
            str(output_path),
        ]

    pg_dump_bin = (env.get("PG_DUMP_BIN") or "pg_dump").strip() or "pg_dump"
    return [
        pg_dump_bin,
        database_url,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        str(output_path),
    ]


def execute_backup(
    env: Mapping[str, str],
    *,
    now: datetime | None = None,
    run_command: CommandRunner | None = None,
) -> tuple[Path, list[str], int]:
    output_path = build_backup_path(env, now=now)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = build_backup_command(env, output_path=output_path)
    runner = run_command or (lambda cmd: subprocess.run(cmd, check=False).returncode)
    return output_path, command, runner(command)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the backup command instead of only printing it.",
    )
    args = parser.parse_args()

    output_path = build_backup_path(os.environ)
    command = build_backup_command(os.environ, output_path=output_path)
    print(f"Backup artifact: {output_path}")
    print("Command:")
    print(" ".join(command))

    if not args.run:
        print("Dry run only. Re-run with --run to execute.")
        return 0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(command, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
