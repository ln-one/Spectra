#!/usr/bin/env python3
"""Aggregate audit for PostgreSQL cutover readiness."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from scripts.deploy_preflight import evaluate_preflight
from scripts.distributed_deploy_audit import evaluate_distributed_readiness
from scripts.postgres_backup_restore_audit import evaluate_backup_restore_readiness
from scripts.postgres_shadow_stack_audit import evaluate_shadow_stack

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
) -> tuple[list[str], int]:
    messages = ["PostgreSQL cutover readiness audit"]
    failures = 0

    preflight_messages, preflight_failures = evaluate_preflight(
        env,
        skip_network=True,
        timeout_seconds=0.1,
        require_postgres=True,
    )
    messages.extend(_prefix("preflight", preflight_messages[1:]))
    failures += preflight_failures

    distributed_messages, distributed_failures = evaluate_distributed_readiness(
        env,
        prisma_provider=prisma_provider,
        base_compose_text=base_compose_text,
        shadow_compose_text=shadow_compose_text,
    )
    messages.extend(_prefix("distributed", distributed_messages[1:]))
    failures += distributed_failures

    backup_messages, backup_failures = evaluate_backup_restore_readiness(env)
    messages.extend(_prefix("backup", backup_messages[1:]))
    failures += backup_failures

    if shadow_compose_text is None:
        failures += 1
        messages.append("[shadow] FAIL postgres shadow compose override missing")
    else:
        shadow_messages, shadow_failures = evaluate_shadow_stack(shadow_compose_text)
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
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
