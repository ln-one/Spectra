#!/usr/bin/env python3
"""Bring up the live PostgreSQL stack and run a deployment smoke flow."""

from __future__ import annotations

import argparse
import http.client
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import deploy_smoke_check  # noqa: E402
from scripts import postgres_live_prisma_validate as live_prisma  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
DEFAULT_SERVICES = [
    "postgres",
    "redis",
    "qdrant",
    "stratumind",
    "backend",
    "worker",
]
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_LIVE_DATABASE_URL = "postgresql://spectra:spectra@127.0.0.1:5432/spectra"

CommandRunner = Callable[[list[str]], int]
HealthWaiter = Callable[..., bool]
SmokeRunner = Callable[..., tuple[list[str], int]]


def build_live_stack_compose_command(*, action: str = "up") -> list[str]:
    command = ["docker", "compose", "-f", str(BASE_COMPOSE)]
    if action == "down":
        command.extend(["rm", "-sf", *DEFAULT_SERVICES])
        return command
    command.extend(["up", "-d", *DEFAULT_SERVICES])
    return command


def wait_for_live_backend(
    base_url: str,
    *,
    timeout_seconds: float = 60.0,
    interval_seconds: float = 1.0,
) -> bool:
    deadline = time.monotonic() + timeout_seconds
    target = base_url.rstrip("/") + "/health"

    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(target, timeout=interval_seconds) as response:
                if response.status == 200:
                    return True
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            http.client.RemoteDisconnected,
            ConnectionResetError,
            OSError,
        ):
            time.sleep(interval_seconds)
            continue

    return False


def build_live_prisma_env(env: dict[str, str] | None = None) -> dict[str, str]:
    merged_env = dict(os.environ)
    if env:
        merged_env.update(env)
    merged_env.setdefault("DATABASE_URL", DEFAULT_LIVE_DATABASE_URL)
    return merged_env


def evaluate_live_stack_flow(
    *,
    base_url: str,
    token: str | None,
    include_smoke: bool,
    run_live_prisma: bool = False,
    teardown_stack: bool = True,
    timeout_seconds: float = 60.0,
    run_command: CommandRunner | None = None,
    wait_for_backend: HealthWaiter = wait_for_live_backend,
    run_smoke_checks: SmokeRunner = deploy_smoke_check.run_smoke_checks,
    live_prisma_eval: Callable[..., tuple[list[str], int]] = (
        live_prisma.evaluate_live_prisma_readiness
    ),
) -> tuple[list[str], int]:
    messages = ["PostgreSQL live stack flow"]
    failures = 0

    runner = run_command or (
        lambda cmd: subprocess.run(cmd, cwd=ROOT, check=False).returncode
    )

    up_command = build_live_stack_compose_command(action="up")
    messages.append("[stack] " + " ".join(up_command))
    up_exit = runner(up_command)
    if up_exit != 0:
        failures += 1
        messages.append(f"[stack] FAIL compose up exited with code {up_exit}")
        return messages, failures
    messages.append("[stack] PASS live stack is up")

    try:
        if wait_for_backend(base_url, timeout_seconds=timeout_seconds):
            messages.append(f"[health] PASS backend became healthy at {base_url}")
        else:
            failures += 1
            messages.append(
                f"[health] FAIL backend did not become healthy at {base_url}"
            )

        if run_live_prisma:
            live_prisma_env = build_live_prisma_env()
            live_prisma_messages, live_prisma_failures = live_prisma_eval(
                live_prisma_env
            )
            messages.extend(
                f"[live-prisma] {message}" for message in live_prisma_messages[1:]
            )
            failures += live_prisma_failures
            if live_prisma_failures == 0:
                _, live_prisma_exit = live_prisma.execute_live_prisma_validation(
                    live_prisma_env
                )
                if live_prisma_exit == 0:
                    messages.append(
                        "[live-prisma] PASS validate/migrate-deploy/generate completed"
                    )
                else:
                    failures += 1
                    messages.append(
                        "[live-prisma] FAIL validate/migrate-deploy/generate exited "
                        f"with code {live_prisma_exit}"
                    )
            else:
                messages.append(
                    "[live-prisma] WARN execution skipped because readiness "
                    "checks failed"
                )
        else:
            messages.append("[live-prisma] WARN live Prisma validation skipped")

        if include_smoke:
            if failures == 0:
                smoke_messages, smoke_failures = run_smoke_checks(
                    base_url=base_url,
                    token=token,
                )
                messages.extend(f"[smoke] {message}" for message in smoke_messages[1:])
                failures += smoke_failures
            else:
                messages.append(
                    "[smoke] WARN smoke skipped because startup checks failed"
                )
        else:
            messages.append("[smoke] WARN smoke skipped")
    finally:
        if teardown_stack:
            down_command = build_live_stack_compose_command(action="down")
            messages.append("[teardown] " + " ".join(down_command))
            down_exit = runner(down_command)
            if down_exit == 0:
                messages.append("[teardown] PASS live stack removed")
            else:
                failures += 1
                messages.append(
                    f"[teardown] FAIL compose down exited with code {down_exit}"
                )
        else:
            messages.append("[teardown] WARN live stack kept running")

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Backend URL for health and optional smoke checks.",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional bearer token for authenticated smoke checks.",
    )
    parser.add_argument(
        "--live-smoke",
        action="store_true",
        help="Run deployment smoke checks after backend health succeeds.",
    )
    parser.add_argument(
        "--run-prisma",
        action="store_true",
        help="Run validate/migrate-deploy/generate against the live PostgreSQL DB.",
    )
    parser.add_argument(
        "--keep-running",
        action="store_true",
        help="Leave the live stack running after the flow completes.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=60.0,
        help="How long to wait for backend /health before failing.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the compose flow instead of only printing the plan.",
    )
    args = parser.parse_args()

    command = build_live_stack_compose_command(action="up")
    print("PostgreSQL live stack flow")
    print("Command:")
    print(" ".join(command))
    print(f"base_url={args.base_url}")
    print(f"run_prisma={args.run_prisma}")
    print(f"live_smoke={args.live_smoke}")
    print(f"teardown={not args.keep_running}")

    if not args.run:
        print("Dry run only. Re-run with --run to execute.")
        return 0

    messages, failures = evaluate_live_stack_flow(
        base_url=args.base_url,
        token=args.token,
        include_smoke=args.live_smoke,
        run_live_prisma=args.run_prisma,
        teardown_stack=not args.keep_running,
        timeout_seconds=args.timeout_seconds,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
