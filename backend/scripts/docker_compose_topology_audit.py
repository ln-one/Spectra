#!/usr/bin/env python3
"""Static topology audit for Docker Compose deployment shape."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"

REQUIRED_BASE_SERVICES = (
    "frontend",
    "backend",
    "worker",
    "redis",
    "stratumind",
    "qdrant",
)
STATEFUL_SERVICES = ("redis", "qdrant", "postgres")
RUNTIME_STORAGE_TARGET = "/var/lib/spectra"
RUNTIME_STORAGE_ENVS = ("UPLOAD_DIR", "ARTIFACT_STORAGE_DIR", "GENERATED_DIR")
BACKUP_STORAGE_ENVS = ("POSTGRES_BACKUP_DIR", "POSTGRES_RESTORE_STAGING_DIR")


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _load_compose(text: str | None) -> dict[str, Any]:
    if not text:
        return {}
    loaded = yaml.safe_load(text) or {}
    return loaded if isinstance(loaded, dict) else {}


def _service(compose: dict[str, Any], name: str) -> dict[str, Any]:
    services = compose.get("services") or {}
    raw = services.get(name) or {}
    return raw if isinstance(raw, dict) else {}


def _depends_on_names(service: dict[str, Any]) -> set[str]:
    depends_on = service.get("depends_on") or {}
    if isinstance(depends_on, dict):
        return set(depends_on.keys())
    if isinstance(depends_on, list):
        return set(depends_on)
    return set()


def _port_bindings(service: dict[str, Any]) -> list[str]:
    ports = service.get("ports") or []
    results: list[str] = []
    for port in ports:
        if isinstance(port, str):
            results.append(port)
        elif isinstance(port, dict) and "published" in port:
            host_ip = str(port.get("host_ip") or "")
            published = str(port.get("published"))
            target = str(port.get("target") or "")
            if host_ip:
                results.append(f"{host_ip}:{published}:{target}")
            else:
                results.append(f"{published}:{target}")
    return results


def _volume_bindings(service: dict[str, Any]) -> list[str]:
    volumes = service.get("volumes") or []
    results: list[str] = []
    for volume in volumes:
        if isinstance(volume, str):
            results.append(volume)
        elif isinstance(volume, dict):
            source = str(volume.get("source") or "")
            target = str(volume.get("target") or "")
            if source and target:
                results.append(f"{source}:{target}")
    return results


def _has_loopback_binding(bindings: list[str]) -> bool:
    return any(binding.startswith(("127.0.0.1:", "localhost:")) for binding in bindings)


def _has_healthcheck(service: dict[str, Any]) -> bool:
    healthcheck = service.get("healthcheck")
    return isinstance(healthcheck, dict) and bool(healthcheck.get("test"))


def _database_url(service: dict[str, Any]) -> str | None:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        value = environment.get("DATABASE_URL")
        return str(value) if value else None
    if isinstance(environment, list):
        for item in environment:
            if isinstance(item, str) and item.startswith("DATABASE_URL="):
                return item.partition("=")[2]
    return None


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


def _mounts_runtime_storage(service: dict[str, Any]) -> bool:
    return any(
        binding.split(":")[-1] == RUNTIME_STORAGE_TARGET
        for binding in _volume_bindings(service)
    )


def evaluate_compose_topology(
    base_compose_text: str,
    shadow_compose_text: str | None = None,
) -> tuple[list[str], int]:
    base = _load_compose(base_compose_text)
    shadow = _load_compose(shadow_compose_text)

    messages = ["Docker Compose topology audit"]
    failures = 0

    services = base.get("services") or {}
    for name in REQUIRED_BASE_SERVICES:
        if name in services:
            messages.append(_format("PASS", f"base compose declares `{name}` service"))
        else:
            messages.append(_format("FAIL", f"base compose missing `{name}` service"))
            failures += 1

    backend = _service(base, "backend")
    worker = _service(base, "worker")

    if backend and worker:
        if backend.get("command") != worker.get("command"):
            messages.append(
                _format("PASS", "backend and worker commands are separated")
            )
        else:
            messages.append(
                _format("FAIL", "backend and worker commands should not be identical")
            )
            failures += 1

        if _port_bindings(worker):
            messages.append(
                _format("FAIL", "worker should not publish public container ports")
            )
            failures += 1
        else:
            messages.append(_format("PASS", "worker stays internal-only"))

    for name in ("backend", "worker"):
        service = _service(base, name)
        if not service:
            continue
        duplicate_env_keys = _duplicate_keys(_environment_keys(service))
        if duplicate_env_keys:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    (
                        f"{name} declares duplicate environment keys: "
                        f"{', '.join(sorted(duplicate_env_keys))}"
                    ),
                )
            )
        else:
            messages.append(_format("PASS", f"{name} environment keys are unique"))
        dependencies = _depends_on_names(service)
        for dependency in ("redis", "stratumind"):
            if dependency in dependencies:
                messages.append(_format("PASS", f"{name} depends on `{dependency}`"))
            else:
                messages.append(
                    _format("FAIL", f"{name} missing `{dependency}` dependency")
                )
                failures += 1

        if _mounts_runtime_storage(service):
            messages.append(
                _format(
                    "PASS",
                    (
                        f"{name} mounts shared runtime storage at "
                        f"`{RUNTIME_STORAGE_TARGET}`"
                    ),
                )
            )
        else:
            messages.append(
                _format(
                    "WARN",
                    (
                        f"{name} does not mount shared runtime storage at "
                        f"`{RUNTIME_STORAGE_TARGET}`"
                    ),
                )
            )

        for env_key in RUNTIME_STORAGE_ENVS:
            env_value = _environment_value(service, env_key)
            if env_value and env_value.startswith(f"{RUNTIME_STORAGE_TARGET}/"):
                messages.append(
                    _format(
                        "PASS",
                        (
                            f"{name} configures `{env_key}` inside shared "
                            "runtime storage"
                        ),
                    )
                )
            else:
                messages.append(
                    _format(
                        "WARN",
                        (
                            f"{name} does not configure `{env_key}` under "
                            "shared runtime storage"
                        ),
                    )
                )

        for env_key in BACKUP_STORAGE_ENVS:
            env_value = _environment_value(service, env_key)
            if env_value and env_value.startswith(f"{RUNTIME_STORAGE_TARGET}/"):
                messages.append(
                    _format(
                        "PASS",
                        (
                            f"{name} configures `{env_key}` inside shared "
                            "runtime storage"
                        ),
                    )
                )
            else:
                messages.append(
                    _format(
                        "WARN",
                        (
                            f"{name} does not configure `{env_key}` under "
                            "shared runtime storage"
                        ),
                    )
                )

    for name in STATEFUL_SERVICES:
        service = _service(base, name) or _service(shadow, name)
        if not service:
            if name == "postgres":
                messages.append(_format("WARN", "postgres service not declared yet"))
                continue
            messages.append(_format("FAIL", f"stateful service `{name}` missing"))
            failures += 1
            continue

        bindings = _port_bindings(service)
        if bindings:
            if _has_loopback_binding(bindings):
                messages.append(
                    _format(
                        "PASS",
                        f"{name} ports are loopback-scoped for local access",
                    )
                )
            else:
                messages.append(
                    _format(
                        "WARN",
                        (
                            f"{name} ports are not loopback-scoped; "
                            "verify private-network exposure"
                        ),
                    )
                )
        else:
            messages.append(_format("INFO", f"{name} does not publish host ports"))

        if _has_healthcheck(service):
            messages.append(_format("PASS", f"{name} declares healthcheck"))
        else:
            messages.append(_format("FAIL", f"{name} missing healthcheck"))
            failures += 1

    if shadow:
        postgres = _service(shadow, "postgres")
        if postgres:
            messages.append(_format("PASS", "shadow override declares postgres"))
        else:
            messages.append(_format("FAIL", "shadow override missing postgres"))
            failures += 1

        for name in ("backend", "worker"):
            service = _service(shadow, name)
            if not service:
                messages.append(
                    _format("FAIL", f"shadow override missing `{name}` service")
                )
                failures += 1
                continue
            dependencies = _depends_on_names(service)
            if "postgres" in dependencies:
                messages.append(_format("PASS", f"shadow `{name}` depends on postgres"))
            else:
                messages.append(
                    _format("FAIL", f"shadow `{name}` missing postgres dependency")
                )
                failures += 1

            database_url = _database_url(service)
            if (
                database_url
                and "postgresql://" in database_url
                and "@postgres:" in database_url
            ):
                messages.append(
                    _format(
                        "PASS",
                        f"shadow `{name}` DATABASE_URL points at postgres service",
                    )
                )
            else:
                messages.append(
                    _format(
                        "FAIL",
                        (
                            f"shadow `{name}` DATABASE_URL "
                            "does not point at postgres service"
                        ),
                    )
                )
                failures += 1

    return messages, failures


def main() -> int:
    base_text = BASE_COMPOSE.read_text(encoding="utf-8")
    shadow_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_compose_topology(base_text, shadow_text)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
