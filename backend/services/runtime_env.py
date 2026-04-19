"""Runtime environment normalization helpers."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import SplitResult, urlsplit, urlunsplit

_DOCKER_ENV = Path("/.dockerenv")
_LOCALHOST_REWRITE_HOSTS = {"postgres"}
_INTERNAL_SERVICE_PORTS = {
    "stratumind": 8110,
    "ourograph": 8101,
    "pagevra": 8090,
    "dualweave": 8080,
    "limora": 3001,
    "diego": 8000,
}


def _running_inside_container() -> bool:
    return _DOCKER_ENV.exists()


def _rewrite_database_netloc(split: SplitResult, host: str) -> str:
    username = split.username or ""
    password = split.password or ""
    port = split.port
    auth = username
    if password:
        auth = f"{auth}:{password}"
    if auth:
        auth = f"{auth}@"
    port_suffix = f":{port}" if port is not None else ""
    return f"{auth}{host}{port_suffix}"


def normalize_database_url(value: str | None, *, inside_container: bool) -> str | None:
    """Rewrite compose-only PostgreSQL hostnames to localhost for host-side runs."""

    raw = (value or "").strip()
    if not raw or inside_container:
        return raw or None

    parsed = urlsplit(raw)
    if parsed.scheme not in {"postgresql", "postgres"}:
        return raw

    host = parsed.hostname
    if host not in _LOCALHOST_REWRITE_HOSTS:
        return raw

    return urlunsplit(
        (
            parsed.scheme,
            _rewrite_database_netloc(parsed, "127.0.0.1"),
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )


def normalize_database_url_for_host_runtime(
    env_var: str = "DATABASE_URL",
) -> str | None:
    """Rewrite compose-only PostgreSQL hostnames to localhost for host-side runs."""

    rewritten = normalize_database_url(
        os.getenv(env_var),
        inside_container=_running_inside_container(),
    )
    if rewritten is None:
        return None
    os.environ[env_var] = rewritten
    return rewritten


def running_inside_container() -> bool:
    return _running_inside_container()


def normalize_stratumind_base_url(
    value: str | None,
    *,
    inside_container: bool,
    local_override: str | None = None,
) -> str | None:
    return normalize_internal_service_base_url(
        value,
        service_name="stratumind",
        inside_container=inside_container,
        local_override=local_override,
    )


def normalize_internal_service_base_url(
    value: str | None,
    *,
    service_name: str,
    inside_container: bool,
    local_override: str | None = None,
) -> str | None:
    """Rewrite known compose service URLs to localhost for host-side runs."""

    raw = (value or "").strip().rstrip("/")
    local = (local_override or "").strip().rstrip("/")

    if inside_container:
        return raw or None

    if local:
        return local

    published_port = _INTERNAL_SERVICE_PORTS.get(service_name)
    if not raw:
        return None

    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"}:
        return raw

    host = parsed.hostname
    if host != service_name:
        return raw

    port = parsed.port or published_port
    if port is None:
        return raw

    return urlunsplit(
        (
            parsed.scheme,
            f"127.0.0.1:{port}",
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )


def normalize_internal_service_base_url_for_host_runtime(
    *,
    env_var: str,
    local_env_var: str,
    service_name: str,
) -> str | None:
    rewritten = normalize_internal_service_base_url(
        os.getenv(env_var),
        service_name=service_name,
        inside_container=_running_inside_container(),
        local_override=os.getenv(local_env_var),
    )
    if rewritten is None:
        return None
    os.environ[env_var] = rewritten
    return rewritten


def normalize_internal_service_urls_for_host_runtime() -> None:
    for env_var, local_env_var, service_name in (
        ("STRATUMIND_BASE_URL", "STRATUMIND_BASE_URL_LOCAL", "stratumind"),
        ("OUROGRAPH_BASE_URL", "OUROGRAPH_BASE_URL_LOCAL", "ourograph"),
        ("PAGEVRA_BASE_URL", "PAGEVRA_BASE_URL_LOCAL", "pagevra"),
        ("DUALWEAVE_BASE_URL", "DUALWEAVE_BASE_URL_LOCAL", "dualweave"),
        ("LIMORA_BASE_URL", "LIMORA_BASE_URL_LOCAL", "limora"),
        ("DIEGO_BASE_URL", "DIEGO_BASE_URL_LOCAL", "diego"),
    ):
        normalize_internal_service_base_url_for_host_runtime(
            env_var=env_var,
            local_env_var=local_env_var,
            service_name=service_name,
        )
