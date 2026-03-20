#!/usr/bin/env python3
"""Aggregate audit for PostgreSQL cutover readiness."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

import scripts.postgres_baseline_promotion_audit as baseline_promotion_audit  # noqa: E402,E501
import scripts.postgres_live_baseline_adoption_audit as live_baseline_audit  # noqa: E402,E501
from scripts import deploy_preflight as preflight_audit  # noqa: E402
from scripts import distributed_deploy_audit as distributed_audit  # noqa: E402
from scripts import postgres_backup_restore_audit as backup_audit  # noqa: E402
from scripts import postgres_migration_sql_audit as migration_sql_audit  # noqa: E402
from scripts import postgres_readiness_audit as readiness_audit  # noqa: E402
from scripts import postgres_shadow_stack_audit as shadow_stack_audit  # noqa: E402
from scripts import postgres_toolchain_audit as toolchain_audit  # noqa: E402

evaluate_postgres_toolchain = toolchain_audit.evaluate_postgres_toolchain

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "backend/prisma/schema.prisma"
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"

_PROVIDER_PREFIX = 'provider = "'


def _read_prisma_provider() -> str | None:
    for raw_line in SCHEMA.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if _PROVIDER_PREFIX not in line:
            continue
        start = line.index(_PROVIDER_PREFIX) + len(_PROVIDER_PREFIX)
        end = line.find('"', start)
        if end != -1:
            return line[start:end]
    return None


def _prefix(section: str, messages: list[str]) -> list[str]:
    return [f"[{section}] {message}" for message in messages]


def evaluate_cutover_readiness(
    env: Mapping[str, str],
    *,
    prisma_provider: str | None,
    base_compose_text: str | None,
    shadow_compose_text: str | None,
    migration_lock_provider: str | None = None,
    migration_sql_messages: list[str] | None = None,
    allow_local_postgres_host: bool = False,
    baseline_package_messages: list[str] | None = None,
    live_baseline_messages: list[str] | None = None,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL cutover readiness audit"]
    failures = 0

    preflight_messages, preflight_failures = preflight_audit.evaluate_preflight(
        env,
        skip_network=True,
        timeout_seconds=0.1,
        require_postgres=True,
        allow_local_host=allow_local_postgres_host,
    )
    messages.extend(_prefix("preflight", preflight_messages[1:]))
    failures += preflight_failures

    distributed_messages, distributed_failures = (
        distributed_audit.evaluate_distributed_readiness(
            env,
            prisma_provider=prisma_provider,
            base_compose_text=base_compose_text,
            shadow_compose_text=shadow_compose_text,
        )
    )
    messages.extend(_prefix("distributed", distributed_messages[1:]))
    failures += distributed_failures

    backup_messages, backup_failures = backup_audit.evaluate_backup_restore_readiness(
        env
    )
    messages.extend(_prefix("backup", backup_messages[1:]))
    failures += backup_failures

    toolchain_messages, toolchain_failures = evaluate_postgres_toolchain(env)
    messages.extend(_prefix("toolchain", toolchain_messages[1:]))
    failures += toolchain_failures

    if migration_lock_provider != "postgresql":
        failures += 1
        messages.append(
            "[baseline] FAIL Prisma migration lock is not ready for PostgreSQL baseline"
        )
    else:
        messages.append(
            "[baseline] PASS Prisma migration lock already targets PostgreSQL"
        )

    sql_messages = migration_sql_messages or ["PostgreSQL migration SQL audit"]
    baseline_sql_warnings = [m for m in sql_messages[1:] if m.startswith("WARN ")]
    messages.extend(_prefix("migration-sql", sql_messages[1:]))
    if baseline_sql_warnings:
        failures += 1
        messages.append(
            (
                "[baseline] FAIL existing Prisma migration SQL still needs "
                "a PostgreSQL baseline path"
            )
        )
    else:
        messages.append(
            (
                "[baseline] PASS existing Prisma migration SQL is ready "
                "for PostgreSQL baseline work"
            )
        )

    package_messages = baseline_package_messages or [
        "PostgreSQL baseline promotion audit"
    ]
    package_failures = len([m for m in package_messages[1:] if m.startswith("FAIL ")])
    messages.extend(_prefix("baseline-package", package_messages[1:]))
    failures += package_failures
    if package_failures:
        messages.append(
            (
                "[baseline] FAIL PostgreSQL baseline package draft is "
                "not ready for promotion"
            )
        )
    else:
        messages.append(
            (
                "[baseline] PASS PostgreSQL baseline package draft is "
                "ready for promotion review"
            )
        )

    candidate_messages = live_baseline_messages or [
        "PostgreSQL live baseline adoption audit"
    ]
    candidate_failures = len(
        [m for m in candidate_messages[1:] if m.startswith("FAIL ")]
    )
    messages.extend(_prefix("live-baseline", candidate_messages[1:]))
    failures += candidate_failures
    if candidate_failures:
        messages.append(
            (
                "[baseline] FAIL PostgreSQL live baseline candidate is not ready "
                "for adoption"
            )
        )
    else:
        messages.append(
            (
                "[baseline] PASS PostgreSQL live baseline candidate is ready "
                "for adoption review"
            )
        )

    if shadow_compose_text is None:
        failures += 1
        messages.append("[shadow] FAIL postgres shadow compose override missing")
    else:
        shadow_messages, shadow_failures = shadow_stack_audit.evaluate_shadow_stack(
            shadow_compose_text
        )
        messages.extend(_prefix("shadow", shadow_messages))
        failures += shadow_failures

    return messages, failures


def main() -> int:
    provider = _read_prisma_provider()
    base_text = (
        BASE_COMPOSE.read_text(encoding="utf-8") if BASE_COMPOSE.exists() else None
    )
    shadow_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_cutover_readiness(
        os.environ,
        prisma_provider=provider,
        base_compose_text=base_text,
        shadow_compose_text=shadow_text,
        migration_lock_provider=readiness_audit.parse_migration_lock_provider(),
        migration_sql_messages=migration_sql_audit.evaluate_migration_sql()[0],
        baseline_package_messages=(
            baseline_promotion_audit.evaluate_baseline_promotion_readiness(os.environ)[
                0
            ]
        ),
        live_baseline_messages=(
            live_baseline_audit.evaluate_live_baseline_adoption_readiness(os.environ)[0]
        ),
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
