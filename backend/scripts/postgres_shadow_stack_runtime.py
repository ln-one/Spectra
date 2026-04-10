#!/usr/bin/env python3
"""Bring up or tear down the local PostgreSQL shadow stack."""

from __future__ import annotations

import argparse
import socket
import subprocess
import time
from pathlib import Path
from typing import Callable, Sequence
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"
DEFAULT_DATABASE_URL = "postgresql://spectra:spectra@127.0.0.1:5432/spectra_shadow"
DEFAULT_BASE_SERVICES = ["postgres", "redis", "qdrant", "stratumind"]
DEFAULT_APP_SERVICES = ["backend", "worker"]

CommandRunner = Callable[[Sequence[str]], int]
ConnectionFactory = Callable[[tuple[str, int], float], socket.socket]


def build_shadow_compose_command(
    *,
    action: str = "up",
    with_app: bool = False,
) -> list[str]:
    command = [
        "docker",
        "compose",
        "-f",
        str(BASE_COMPOSE),
        "-f",
        str(SHADOW_COMPOSE),
    ]
    services = [*DEFAULT_BASE_SERVICES]
    if with_app:
        services.extend(DEFAULT_APP_SERVICES)

    if action == "down":
        command.extend(["rm", "-sf", *services])
        return command

    command.extend(["up", "-d", *services])
    return command


def wait_for_shadow_postgres(
    database_url: str,
    *,
    timeout_seconds: float = 30.0,
    interval_seconds: float = 1.0,
    connect: ConnectionFactory = socket.create_connection,
) -> bool:
    parsed = urlparse(database_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 5432
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        try:
            conn = connect((host, port), interval_seconds)
        except OSError:
            time.sleep(interval_seconds)
            continue

        conn.close()
        return True

    return False


def execute_shadow_stack_command(
    *,
    action: str,
    with_app: bool,
    database_url: str,
    timeout_seconds: float = 30.0,
    run_command: CommandRunner | None = None,
    wait_for_postgres: Callable[..., bool] = wait_for_shadow_postgres,
) -> tuple[list[str], int]:
    command = build_shadow_compose_command(action=action, with_app=with_app)
    runner = run_command or (
        lambda cmd: subprocess.run(cmd, cwd=ROOT, check=False).returncode
    )
    exit_code = runner(command)
    if exit_code != 0:
        return command, exit_code

    if action == "up":
        ready = wait_for_postgres(
            database_url,
            timeout_seconds=timeout_seconds,
        )
        return command, 0 if ready else 2

    return command, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--down",
        action="store_true",
        help="Tear down the PostgreSQL shadow stack instead of bringing it up.",
    )
    parser.add_argument(
        "--with-app",
        action="store_true",
        help="Include backend and worker services in the shadow stack bring-up.",
    )
    parser.add_argument(
        "--database-url",
        default=DEFAULT_DATABASE_URL,
        help="Host-visible PostgreSQL shadow URL used for readiness polling.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=30.0,
        help="How long to wait for PostgreSQL shadow readiness after compose up.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the compose command instead of only printing it.",
    )
    args = parser.parse_args()

    action = "down" if args.down else "up"
    command = build_shadow_compose_command(action=action, with_app=args.with_app)
    print("PostgreSQL shadow stack runtime")
    print("Command:")
    print(" ".join(command))

    if not args.run:
        print("Dry run only. Re-run with --run to execute.")
        return 0

    _, exit_code = execute_shadow_stack_command(
        action=action,
        with_app=args.with_app,
        database_url=args.database_url,
        timeout_seconds=args.timeout_seconds,
    )
    if exit_code == 2:
        print("FAIL shadow postgres did not become reachable before timeout")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
