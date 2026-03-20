#!/usr/bin/env python3
"""Aggregate audit for PostgreSQL cutover readiness."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from scripts.deploy_preflight import evaluate_preflight
from scripts.deployment_env_role_audit import evaluate_role_contract
from scripts.docker_deploy_readiness_audit import evaluate_docker_readiness
from scripts.postgres_shadow_stack_audit import evaluate_shadow_stack

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "backend/prisma/schema.prisma"
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

    docker_messages, docker_failures = evaluate_docker_readiness(env, prisma_provider)
    messages.extend(_prefix("docker", docker_messages))
    failures += docker_failures

    for role in ("backend", "worker"):
        role_messages, role_failures = evaluate_role_contract(role, env)
        messages.extend(_prefix(role, role_messages[1:]))
        failures += role_failures

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
    shadow_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_cutover_readiness(
        os.environ,
        prisma_provider=provider,
        shadow_compose_text=shadow_text,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
