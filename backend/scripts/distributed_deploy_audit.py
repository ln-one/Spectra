#!/usr/bin/env python3
"""Aggregate audit for Docker-based distributed deployment readiness."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from scripts.deployment_env_role_audit import evaluate_role_contract
from scripts.docker_compose_topology_audit import evaluate_compose_topology
from scripts.docker_deploy_readiness_audit import evaluate_docker_readiness
from scripts.postgres_backup_restore_audit import evaluate_backup_restore_readiness
from scripts.runtime_assumption_audit import evaluate_runtime_assumptions
from scripts.storage_deploy_readiness_audit import evaluate_storage_readiness

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"
SCHEMA = ROOT / "backend/prisma/schema.prisma"
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


def evaluate_distributed_readiness(
    env: Mapping[str, str],
    *,
    prisma_provider: str | None,
    base_compose_text: str | None,
    shadow_compose_text: str | None,
) -> tuple[list[str], int]:
    messages = ["Distributed deployment readiness audit"]
    failures = 0

    if base_compose_text is None:
        failures += 1
        messages.append("[compose] FAIL docker-compose.yml missing")
    else:
        topology_messages, topology_failures = evaluate_compose_topology(
            base_compose_text,
            shadow_compose_text,
        )
        messages.extend(_prefix("compose", topology_messages[1:]))
        failures += topology_failures

    docker_messages, docker_failures = evaluate_docker_readiness(env, prisma_provider)
    messages.extend(_prefix("docker", docker_messages))
    failures += docker_failures

    storage_messages, storage_failures = evaluate_storage_readiness(env)
    messages.extend(_prefix("storage", storage_messages[1:]))
    failures += storage_failures

    runtime_messages, runtime_failures = evaluate_runtime_assumptions()
    messages.extend(_prefix("runtime", runtime_messages[1:]))
    failures += runtime_failures

    backup_messages, backup_failures = evaluate_backup_restore_readiness(env)
    messages.extend(_prefix("backup", backup_messages[1:]))
    failures += backup_failures

    for role in ("backend", "worker"):
        role_messages, role_failures = evaluate_role_contract(role, env)
        messages.extend(_prefix(role, role_messages[1:]))
        failures += role_failures

    return messages, failures


def main() -> int:
    base_compose_text = (
        BASE_COMPOSE.read_text(encoding="utf-8") if BASE_COMPOSE.exists() else None
    )
    shadow_compose_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_distributed_readiness(
        os.environ,
        prisma_provider=_read_prisma_provider(),
        base_compose_text=base_compose_text,
        shadow_compose_text=shadow_compose_text,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
