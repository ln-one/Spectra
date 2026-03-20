#!/usr/bin/env python3
"""Run a PostgreSQL cutover rehearsal.

It aggregates audits, recovery drill, and optional live shadow smoke.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Callable, Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_cutover_audit as cutover_audit  # noqa: E402
from scripts import postgres_migration_sql_audit as migration_sql_audit  # noqa: E402
from scripts import postgres_readiness_audit as readiness_audit  # noqa: E402
from scripts import postgres_recovery_drill as recovery_drill  # noqa: E402
from scripts import postgres_shadow_smoke as shadow_smoke  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"


def _prefix(section: str, messages: list[str]) -> list[str]:
    return [f"[{section}] {message}" for message in messages]


def evaluate_cutover_rehearsal(
    env: Mapping[str, str],
    *,
    base_url: str | None = None,
    token: str | None = None,
    base_compose_text: str | None,
    shadow_compose_text: str | None,
    prisma_provider: str | None,
    migration_lock_provider: str | None,
    migration_sql_messages: list[str] | None,
    cutover_eval: Callable[..., tuple[list[str], int]] = (
        cutover_audit.evaluate_cutover_readiness
    ),
    recovery_eval: Callable[..., tuple[list[str], int]] = (
        recovery_drill.evaluate_recovery_drill
    ),
    shadow_eval: Callable[..., tuple[list[str], int]] = (
        shadow_smoke.evaluate_shadow_smoke
    ),
) -> tuple[list[str], int]:
    messages = ["PostgreSQL cutover rehearsal"]
    failures = 0

    cutover_messages, cutover_failures = cutover_eval(
        env,
        prisma_provider=prisma_provider,
        base_compose_text=base_compose_text,
        shadow_compose_text=shadow_compose_text,
        migration_lock_provider=migration_lock_provider,
        migration_sql_messages=migration_sql_messages,
    )
    messages.extend(_prefix("cutover", cutover_messages[1:]))
    failures += cutover_failures

    recovery_messages, recovery_failures = recovery_eval(env)
    messages.extend(_prefix("recovery", recovery_messages[1:]))
    failures += recovery_failures

    if base_url:
        shadow_messages, shadow_failures = shadow_eval(
            env,
            base_url=base_url,
            token=token,
            prisma_provider=prisma_provider,
            base_compose_text=base_compose_text,
            shadow_compose_text=shadow_compose_text,
            include_cutover_audit=False,
        )
        messages.extend(_prefix("shadow-smoke", shadow_messages[1:]))
        failures += shadow_failures
    else:
        messages.append(
            "[shadow-smoke] WARN live shadow smoke skipped (no base URL provided)"
        )

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=None,
        help=(
            "Optional live shadow backend URL. If omitted, only static "
            "rehearsal runs."
        ),
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional bearer token for authenticated smoke checks.",
    )
    args = parser.parse_args()

    base_text = (
        BASE_COMPOSE.read_text(encoding="utf-8") if BASE_COMPOSE.exists() else None
    )
    shadow_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_cutover_rehearsal(
        os.environ,
        base_url=args.base_url,
        token=args.token,
        base_compose_text=base_text,
        shadow_compose_text=shadow_text,
        prisma_provider=cutover_audit._read_prisma_provider(),
        migration_lock_provider=readiness_audit.parse_migration_lock_provider(),
        migration_sql_messages=migration_sql_audit.evaluate_migration_sql()[0],
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
