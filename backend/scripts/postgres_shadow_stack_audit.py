#!/usr/bin/env python3
"""Static audit for the local PostgreSQL shadow stack."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_OVERRIDE = ROOT / "docker-compose.postgres-shadow.yml"
RUNTIME_STORAGE_TARGET = "/var/lib/spectra"
BACKUP_STORAGE_ENVS = ("POSTGRES_BACKUP_DIR", "POSTGRES_RESTORE_STAGING_DIR")


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _load_compose(text: str) -> dict[str, Any]:
    loaded = yaml.safe_load(text) or {}
    return loaded if isinstance(loaded, dict) else {}


def _service(compose: dict[str, Any], name: str) -> dict[str, Any]:
    services = compose.get("services") or {}
    raw = services.get(name) or {}
    return raw if isinstance(raw, dict) else {}


def _environment_value(service: dict[str, Any], key: str) -> str | None:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        value = environment.get(key)
        return str(value) if value is not None else None
    if isinstance(environment, list):
        for item in environment:
            if isinstance(item, str) and item.startswith(f"{key}="):
                return item.partition("=")[2]
    return None


def _environment_keys(service: dict[str, Any]) -> list[str]:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        return [str(key) for key in environment.keys()]
    if isinstance(environment, list):
        keys: list[str] = []
        for item in environment:
            if isinstance(item, str) and "=" in item:
                keys.append(item.partition("=")[0])
        return keys
    return []


def _duplicate_keys(keys: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for key in keys:
        if key in seen and key not in duplicates:
            duplicates.append(key)
        seen.add(key)
    return duplicates


def evaluate_shadow_stack(compose_text: str) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0
    compose = _load_compose(compose_text)

    expectations = {
        "postgres_service": "  postgres:\n",
        "backend_service": "  backend:\n",
        "worker_service": "  worker:\n",
        "postgres_image": "image: postgres:",
        "postgres_healthcheck": "healthcheck:",
        "backend_url": "postgresql://spectra:spectra@postgres:5432/spectra_shadow",
        "worker_url": "postgresql://spectra:spectra@postgres:5432/spectra_shadow",
        "postgres_volume": "postgres_shadow_data:",
    }

    labels = {
        "postgres_service": "postgres service declared",
        "backend_service": "backend override declared",
        "worker_service": "worker override declared",
        "postgres_image": "PostgreSQL image configured",
        "postgres_healthcheck": "PostgreSQL healthcheck configured",
        "backend_url": "backend DATABASE_URL points to postgres shadow",
        "worker_url": "worker DATABASE_URL points to postgres shadow",
        "postgres_volume": "postgres shadow volume declared",
    }

    for key, token in expectations.items():
        if token in compose_text:
            messages.append(_format("PASS", labels[key]))
        else:
            failures += 1
            messages.append(_format("FAIL", labels[key]))

    if "127.0.0.1:5432:5432" in compose_text:
        messages.append(
            _format(
                "INFO",
                "PostgreSQL shadow port is loopback-bound for local validation",
            )
        )
    else:
        messages.append(
            _format(
                "WARN",
                "PostgreSQL shadow port binding is not loopback-scoped; "
                "verify exposure",
            )
        )

    for name in ("backend", "worker"):
        service = _service(compose, name)
        duplicate_env_keys = _duplicate_keys(_environment_keys(service))
        if duplicate_env_keys:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    (
                        f"{name} shadow override declares duplicate env keys: "
                        f"{', '.join(sorted(duplicate_env_keys))}"
                    ),
                )
            )
        else:
            messages.append(_format("PASS", f"{name} shadow env keys are unique"))

        for env_key in BACKUP_STORAGE_ENVS:
            env_value = _environment_value(service, env_key)
            if env_value and env_value.startswith(f"{RUNTIME_STORAGE_TARGET}/"):
                messages.append(
                    _format(
                        "PASS",
                        (
                            f"{name} shadow override configures `{env_key}` "
                            "in shared storage"
                        ),
                    )
                )
            else:
                failures += 1
                messages.append(
                    _format(
                        "FAIL",
                        (f"{name} shadow override missing shared-storage `{env_key}`"),
                    )
                )

    return messages, failures


def main() -> int:
    if not COMPOSE_OVERRIDE.exists():
        print("PostgreSQL Shadow Stack Audit")
        print(f"- Override file: {COMPOSE_OVERRIDE}")
        print("FAIL postgres shadow compose override is missing")
        return 1

    messages, failures = evaluate_shadow_stack(
        COMPOSE_OVERRIDE.read_text(encoding="utf-8")
    )

    print("PostgreSQL Shadow Stack Audit")
    print(f"- Override file: {COMPOSE_OVERRIDE}")
    print()
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
