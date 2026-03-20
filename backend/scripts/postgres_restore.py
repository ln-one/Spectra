#!/usr/bin/env python3
"""Restore a PostgreSQL backup artifact for cutover validation or rollback drills."""

from __future__ import annotations

import argparse
import os
import subprocess
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


def stage_restore_input(
    backup_path: Path,
    env: Mapping[str, str],
) -> Path:
    staging_dir = Path((env.get("POSTGRES_RESTORE_STAGING_DIR") or "").strip())
    if not staging_dir:
        raise ValueError("POSTGRES_RESTORE_STAGING_DIR must be configured")
    return staging_dir / backup_path.name


def build_restore_command(
    env: Mapping[str, str],
    *,
    backup_path: Path,
    database_url: str | None = None,
) -> list[str]:
    db_url = _require_postgres_url(
        (database_url or env.get("DATABASE_URL") or "").strip()
    )
    use_docker = _is_truthy(env.get("POSTGRES_BACKUP_USE_DOCKER"))
    suffix = backup_path.suffix.lower()

    if suffix == ".sql":
        binary_env_key = "PSQL_BIN"
        default_binary = "psql"
        docker_binary = "psql"
    else:
        binary_env_key = "PG_RESTORE_BIN"
        default_binary = "pg_restore"
        docker_binary = "pg_restore"

    if use_docker:
        docker_bin = (env.get("DOCKER_BIN") or "docker").strip() or "docker"
        image = (env.get("POSTGRES_TOOLCHAIN_IMAGE") or "postgres:16-alpine").strip()
        if suffix == ".sql":
            return [
                docker_bin,
                "run",
                "--rm",
                "-e",
                f"DATABASE_URL={db_url}",
                "-v",
                f"{backup_path.parent}:{backup_path.parent}",
                image,
                docker_binary,
                db_url,
                "-f",
                str(backup_path),
            ]
        return [
            docker_bin,
            "run",
            "--rm",
            "-e",
            f"DATABASE_URL={db_url}",
            "-v",
            f"{backup_path.parent}:{backup_path.parent}",
            image,
            docker_binary,
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "--dbname",
            db_url,
            str(backup_path),
        ]

    binary = (env.get(binary_env_key) or default_binary).strip() or default_binary
    if suffix == ".sql":
        return [binary, db_url, "-f", str(backup_path)]
    return [
        binary,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        db_url,
        str(backup_path),
    ]


def execute_restore(
    env: Mapping[str, str],
    *,
    backup_path: Path,
    database_url: str | None = None,
    run_command: CommandRunner | None = None,
) -> tuple[list[str], int]:
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup artifact not found: {backup_path}")
    command = build_restore_command(
        env,
        backup_path=backup_path,
        database_url=database_url,
    )
    runner = run_command or (lambda cmd: subprocess.run(cmd, check=False).returncode)
    return command, runner(command)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup_path", help="Path to a .dump or .sql backup artifact.")
    parser.add_argument(
        "--database-url",
        help="Override DATABASE_URL for restore drills.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the restore command instead of only printing it.",
    )
    args = parser.parse_args()

    backup_path = Path(args.backup_path).expanduser().resolve()
    staged_path = stage_restore_input(backup_path, os.environ)
    command = build_restore_command(
        os.environ,
        backup_path=backup_path,
        database_url=args.database_url,
    )
    print(f"Restore source: {backup_path}")
    print(f"Restore staging target: {staged_path}")
    print("Command:")
    print(" ".join(command))

    if not args.run:
        print("Dry run only. Re-run with --run to execute.")
        return 0

    if not backup_path.exists():
        raise SystemExit(f"Backup artifact not found: {backup_path}")
    result = subprocess.run(command, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
