#!/usr/bin/env python3
"""Static readiness audit for Docker/distributed deployment."""

from __future__ import annotations

from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse

import yaml

try:
    from scripts.env_bootstrap import build_script_env
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    from env_bootstrap import build_script_env

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "backend/prisma/schema.prisma"
BASE_COMPOSE = ROOT / "docker-compose.yml"

LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}
PLACEHOLDER_FRONTEND_API = "http://localhost:8000"
_SHARED_RUNTIME_ENV_KEYS = (
    "DATABASE_URL",
    "REDIS_HOST",
    "REDIS_PORT",
    "CHROMA_HOST",
    "CHROMA_PORT",
    "UPLOAD_DIR",
    "ARTIFACT_STORAGE_DIR",
    "GENERATED_DIR",
    "CHROMA_PERSIST_DIR",
    "AI_REQUEST_TIMEOUT_SECONDS",
    "DEFAULT_MODEL",
    "LARGE_MODEL",
    "SMALL_MODEL",
    "JWT_SECRET_KEY",
)


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _read_prisma_provider() -> str | None:
    provider_prefix = 'provider = "'
    for line in SCHEMA.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if provider_prefix in line:
            start = line.index(provider_prefix) + len(provider_prefix)
            end = line.find('"', start)
            if end != -1:
                return line[start:end]
    return None


def _parse_database_host(database_url: str | None) -> str | None:
    if not database_url:
        return None
    parsed = urlparse(database_url)
    return parsed.hostname


def _extract_service_env(compose_text: str | None, service_name: str) -> dict[str, str]:
    if not compose_text:
        return {}
    loaded = yaml.safe_load(compose_text) or {}
    if not isinstance(loaded, dict):
        return {}
    services = loaded.get("services") or {}
    if not isinstance(services, dict):
        return {}
    service = services.get(service_name) or {}
    if not isinstance(service, dict):
        return {}
    environment = service.get("environment") or {}
    extracted: dict[str, str] = {}
    if isinstance(environment, dict):
        for key, value in environment.items():
            if value is not None:
                extracted[str(key)] = str(value)
        return extracted
    if isinstance(environment, list):
        for item in environment:
            if not isinstance(item, str) or "=" not in item:
                continue
            key, _, value = item.partition("=")
            key = key.strip()
            if key:
                extracted[key] = value
    return extracted


def _collect_compose_service_envs(
    compose_text: str | None,
) -> dict[str, dict[str, str]]:
    return {
        "backend": _extract_service_env(compose_text, "backend"),
        "worker": _extract_service_env(compose_text, "worker"),
    }


def build_effective_env(
    env: Mapping[str, str], compose_text: str | None
) -> dict[str, str]:
    merged = dict(env)
    merged.update(_extract_service_env(compose_text, "backend"))
    return merged


def _classify_host(
    *,
    label: str,
    host: str | None,
    required_for_distributed: bool,
) -> tuple[list[str], int]:
    if not host:
        if required_for_distributed:
            return [_format("WARN", f"{label} not configured")], 0
        return [_format("INFO", f"{label} not configured")], 0

    if host in LOCAL_HOSTS:
        return [
            _format(
                "WARN",
                f"{label} still points to local-only host `{host}`",
            )
        ], 0

    return [_format("PASS", f"{label} points to distributed host `{host}`")], 0


def _classify_path_env(key: str, value: str | None) -> tuple[list[str], int]:
    if not value:
        return [], 0

    path = value.strip()
    if not path:
        return [], 0

    if path.startswith("./") or path.startswith("../") or path.startswith("/tmp/"):
        return [
            _format(
                "WARN",
                (
                    f"{key} uses process-local path `{path}`; "
                    "verify shared volume strategy"
                ),
            )
        ], 0

    return [_format("INFO", f"{key} configured as `{path}`")], 0


def _evaluate_shared_env_alignment(compose_text: str | None) -> list[str]:
    if not compose_text:
        return []

    service_envs = _collect_compose_service_envs(compose_text)
    backend_env = service_envs["backend"]
    worker_env = service_envs["worker"]
    if not backend_env or not worker_env:
        return []

    messages: list[str] = []
    compared = 0
    for key in _SHARED_RUNTIME_ENV_KEYS:
        backend_value = backend_env.get(key)
        worker_value = worker_env.get(key)
        if backend_value is None and worker_value is None:
            continue
        compared += 1
        if backend_value is None:
            messages.append(
                _format(
                    "WARN",
                    f"backend/worker env drift detected: `{key}` missing on backend",
                )
            )
            continue
        if worker_value is None:
            messages.append(
                _format(
                    "WARN",
                    f"backend/worker env drift detected: `{key}` missing on worker",
                )
            )
            continue
        if backend_value != worker_value:
            messages.append(
                _format(
                    "WARN",
                    (
                        f"backend/worker env drift detected: `{key}` differs "
                        f"(backend=`{backend_value}` worker=`{worker_value}`)"
                    ),
                )
            )

    if compared and not messages:
        messages.append(
            _format("PASS", "backend/worker shared runtime env remains aligned")
        )
    return messages


def evaluate_docker_readiness(
    env: Mapping[str, str],
    prisma_provider: str | None,
    compose_text: str | None = None,
) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0

    if prisma_provider == "sqlite":
        messages.append(
            _format(
                "WARN",
                (
                    "Prisma datasource still uses sqlite; distributed deployment "
                    "should prefer PostgreSQL"
                ),
            )
        )
    elif prisma_provider == "postgresql":
        messages.append(
            _format("PASS", "Prisma datasource is already configured for PostgreSQL")
        )
    else:
        messages.append(
            _format(
                "WARN",
                f"Prisma datasource provider is `{prisma_provider or 'unknown'}`",
            )
        )

    db_messages, db_failures = _classify_host(
        label="DATABASE_URL host",
        host=_parse_database_host(env.get("DATABASE_URL")),
        required_for_distributed=True,
    )
    messages.extend(db_messages)
    failures += db_failures

    for key in ("REDIS_HOST", "CHROMA_HOST"):
        host_messages, host_failures = _classify_host(
            label=key,
            host=env.get(key),
            required_for_distributed=False,
        )
        messages.extend(host_messages)
        failures += host_failures

    frontend_api = env.get("NEXT_PUBLIC_API_URL")
    if not frontend_api:
        messages.append(_format("INFO", "NEXT_PUBLIC_API_URL not configured"))
    elif frontend_api == PLACEHOLDER_FRONTEND_API:
        messages.append(
            _format(
                "WARN",
                "NEXT_PUBLIC_API_URL still points at local backend placeholder",
            )
        )
    else:
        messages.append(
            _format("PASS", "NEXT_PUBLIC_API_URL is set for non-local deployment")
        )

    for key in ("CHROMA_PERSIST_DIR", "CHROME_PATH"):
        path_messages, path_failures = _classify_path_env(key, env.get(key))
        messages.extend(path_messages)
        failures += path_failures

    if env.get("SYNC_RAG_INDEXING", "false").lower() in {"1", "true", "yes", "on"}:
        messages.append(
            _format(
                "WARN",
                (
                    "SYNC_RAG_INDEXING is enabled; distributed API deployments "
                    "should prefer async indexing"
                ),
            )
        )
    else:
        messages.append(_format("PASS", "SYNC_RAG_INDEXING is async-friendly"))

    messages.extend(_evaluate_shared_env_alignment(compose_text))

    return messages, failures


def main() -> int:
    provider = _read_prisma_provider()
    compose_text = (
        BASE_COMPOSE.read_text(encoding="utf-8") if BASE_COMPOSE.exists() else None
    )
    messages, failures = evaluate_docker_readiness(
        build_effective_env(build_script_env(), compose_text),
        provider,
        compose_text,
    )

    print("Docker Deployment Readiness Audit")
    print(f"- Root: {ROOT}")
    print(f"- Prisma schema: {SCHEMA}")
    print()
    for message in messages:
        print(message)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
