#!/usr/bin/env python3
"""Run the PostgreSQL shadow flow end to end."""

from __future__ import annotations

import argparse
import os
import time
import urllib.error
import urllib.request
from typing import Callable, Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_shadow_prisma_validate as shadow_prisma  # noqa: E402
from scripts import postgres_shadow_smoke as shadow_smoke  # noqa: E402
from scripts import postgres_shadow_stack_runtime as shadow_stack  # noqa: E402

BASE_URL = "http://127.0.0.1:8000"


RuntimeExecutor = Callable[..., tuple[list[str], int]]
PrismaEvaluator = Callable[..., tuple[list[str], int]]
PrismaExecutor = Callable[..., tuple[list[list[str]], int]]
SmokeEvaluator = Callable[..., tuple[list[str], int]]
HealthWaiter = Callable[..., bool]


def _prefix(section: str, messages: list[str]) -> list[str]:
    return [f"[{section}] {message}" for message in messages]


def wait_for_shadow_backend(
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
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
            time.sleep(interval_seconds)
            continue

    return False


def evaluate_shadow_flow(
    env: Mapping[str, str],
    *,
    with_app: bool,
    base_url: str | None,
    token: str | None,
    include_live_smoke: bool,
    stack_runtime: RuntimeExecutor = shadow_stack.execute_shadow_stack_command,
    prisma_eval: PrismaEvaluator = shadow_prisma.evaluate_shadow_prisma_readiness,
    prisma_execute: PrismaExecutor = shadow_prisma.execute_shadow_prisma_validation,
    smoke_eval: SmokeEvaluator = shadow_smoke.evaluate_shadow_smoke,
    wait_for_backend: HealthWaiter = wait_for_shadow_backend,
    teardown_stack: bool = True,
    timeout_seconds: float = 60.0,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL shadow flow"]
    failures = 0

    up_command, up_exit = stack_runtime(
        action="up",
        with_app=with_app,
        database_url=env.get(
            shadow_prisma.SHADOW_DATABASE_ENV,
            shadow_stack.DEFAULT_DATABASE_URL,
        ),
        timeout_seconds=timeout_seconds,
    )
    messages.append("[stack] " + " ".join(up_command))
    if up_exit != 0:
        failures += 1
        messages.append(f"[stack] FAIL compose up exited with code {up_exit}")
        return messages, failures
    messages.append("[stack] PASS shadow stack is up")

    prisma_messages, prisma_failures = prisma_eval(env)
    messages.extend(_prefix("shadow-prisma", prisma_messages[1:]))
    failures += prisma_failures

    if prisma_failures == 0:
        _, prisma_exit = prisma_execute(env)
        if prisma_exit == 0:
            messages.append("[shadow-prisma] PASS validate/db-push/generate completed")
        else:
            failures += 1
            messages.append(
                "[shadow-prisma] FAIL validate/db-push/generate "
                f"exited with code {prisma_exit}"
            )
    else:
        messages.append(
            "[shadow-prisma] WARN execution skipped because readiness checks failed"
        )

    if include_live_smoke:
        if not with_app:
            messages.append(
                "[shadow-smoke] WARN live smoke requires --with-app; skipped"
            )
        elif failures == 0:
            resolved_base_url = base_url or BASE_URL
            if wait_for_backend(resolved_base_url, timeout_seconds=timeout_seconds):
                messages.append(
                    f"[shadow-smoke] PASS backend became healthy at {resolved_base_url}"
                )
                smoke_messages, smoke_failures = smoke_eval(
                    env,
                    base_url=resolved_base_url,
                    token=token,
                    prisma_provider=None,
                    base_compose_text=None,
                    shadow_compose_text=None,
                    include_cutover_audit=False,
                )
                messages.extend(_prefix("shadow-smoke", smoke_messages[1:]))
                failures += smoke_failures
            else:
                failures += 1
                messages.append(
                    "[shadow-smoke] FAIL backend did not become healthy at "
                    f"{resolved_base_url}"
                )
        else:
            messages.append(
                "[shadow-smoke] WARN live smoke skipped because earlier steps failed"
            )
    else:
        messages.append("[shadow-smoke] WARN live smoke skipped")

    if teardown_stack:
        down_command, down_exit = stack_runtime(
            action="down",
            with_app=with_app,
            database_url=env.get(
                shadow_prisma.SHADOW_DATABASE_ENV,
                shadow_stack.DEFAULT_DATABASE_URL,
            ),
            timeout_seconds=timeout_seconds,
        )
        messages.append("[teardown] " + " ".join(down_command))
        if down_exit == 0:
            messages.append("[teardown] PASS shadow stack removed")
        else:
            failures += 1
            messages.append(
                f"[teardown] FAIL compose down exited with code {down_exit}"
            )
    else:
        messages.append("[teardown] WARN shadow stack kept running")

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--with-app",
        action="store_true",
        help=("Include backend and worker in the shadow stack and allow live smoke."),
    )
    parser.add_argument(
        "--base-url",
        default=BASE_URL,
        help="Backend URL for optional live shadow smoke.",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional bearer token for authenticated live smoke.",
    )
    parser.add_argument(
        "--live-smoke",
        action="store_true",
        help="Run live smoke against the shadow backend after Prisma validation.",
    )
    parser.add_argument(
        "--keep-running",
        action="store_true",
        help="Leave the shadow stack running after the flow completes.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=60.0,
        help="How long to wait for the shadow PostgreSQL socket to become ready.",
    )
    parser.add_argument(
        "--run",
        action="store_true",
        help="Execute the shadow flow instead of only printing the plan.",
    )
    args = parser.parse_args()

    print("PostgreSQL shadow flow")
    print(f"with_app={args.with_app}")
    print(f"live_smoke={args.live_smoke}")
    print(f"teardown={not args.keep_running}")
    print(f"base_url={args.base_url}")
    print(f"shadow_db_env={shadow_prisma.SHADOW_DATABASE_ENV}")

    if not args.run:
        print("Dry run only. Re-run with --run to execute the full shadow flow.")
        return 0

    messages, failures = evaluate_shadow_flow(
        os.environ,
        with_app=args.with_app,
        base_url=args.base_url,
        token=args.token,
        include_live_smoke=args.live_smoke,
        teardown_stack=not args.keep_running,
        timeout_seconds=args.timeout_seconds,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
