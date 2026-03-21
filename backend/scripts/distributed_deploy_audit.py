#!/usr/bin/env python3
"""Aggregate audit for Docker-based distributed deployment readiness."""

from __future__ import annotations

from pathlib import Path
from typing import Mapping

import yaml

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import deployment_env_role_audit as role_audit  # noqa: E402
from scripts import docker_compose_topology_audit as compose_audit  # noqa: E402
from scripts import docker_deploy_readiness_audit as docker_audit  # noqa: E402
from scripts import postgres_backup_restore_audit as backup_audit  # noqa: E402
from scripts import runtime_assumption_audit as runtime_audit  # noqa: E402
from scripts import storage_deploy_readiness_audit as storage_audit  # noqa: E402
from scripts.env_bootstrap import build_script_env  # noqa: E402

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


def _extract_service_env(
    compose_text: str | None, service_names: tuple[str, ...]
) -> dict[str, str]:
    if not compose_text:
        return {}
    loaded = yaml.safe_load(compose_text) or {}
    if not isinstance(loaded, dict):
        return {}
    services = loaded.get("services") or {}
    if not isinstance(services, dict):
        return {}

    extracted: dict[str, str] = {}
    for service_name in service_names:
        service = services.get(service_name) or {}
        if not isinstance(service, dict):
            continue
        raw_env = service.get("environment") or {}
        if isinstance(raw_env, dict):
            for key, value in raw_env.items():
                if value is not None:
                    extracted[str(key)] = str(value)
            continue
        if isinstance(raw_env, list):
            for item in raw_env:
                if not isinstance(item, str) or "=" not in item:
                    continue
                key, _, value = item.partition("=")
                key = key.strip()
                if key:
                    extracted[key] = value
    return extracted


def evaluate_distributed_readiness(
    env: Mapping[str, str],
    *,
    prisma_provider: str | None,
    base_compose_text: str | None,
    shadow_compose_text: str | None,
) -> tuple[list[str], int]:
    messages = ["Distributed deployment readiness audit"]
    failures = 0
    effective_env = dict(env)
    effective_env.update(
        _extract_service_env(
            base_compose_text,
            ("backend", "worker"),
        )
    )
    effective_env.update(
        _extract_service_env(
            shadow_compose_text,
            ("backend", "worker"),
        )
    )

    if base_compose_text is None:
        failures += 1
        messages.append("[compose] FAIL docker-compose.yml missing")
    else:
        topology_messages, topology_failures = compose_audit.evaluate_compose_topology(
            base_compose_text,
            shadow_compose_text,
        )
        messages.extend(_prefix("compose", topology_messages[1:]))
        failures += topology_failures

    docker_messages, docker_failures = docker_audit.evaluate_docker_readiness(
        effective_env, prisma_provider
    )
    messages.extend(_prefix("docker", docker_messages))
    failures += docker_failures

    storage_messages, storage_failures = storage_audit.evaluate_storage_readiness(
        effective_env
    )
    messages.extend(_prefix("storage", storage_messages[1:]))
    failures += storage_failures

    runtime_messages, runtime_failures = runtime_audit.evaluate_runtime_assumptions()
    messages.extend(_prefix("runtime", runtime_messages[1:]))
    failures += runtime_failures

    backup_messages, backup_failures = backup_audit.evaluate_backup_restore_readiness(
        effective_env
    )
    messages.extend(_prefix("backup", backup_messages[1:]))
    failures += backup_failures

    for role in ("backend", "worker"):
        role_messages, role_failures = role_audit.evaluate_role_contract(
            role, effective_env
        )
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
        build_script_env(root=ROOT),
        prisma_provider=_read_prisma_provider(),
        base_compose_text=base_compose_text,
        shadow_compose_text=shadow_compose_text,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
