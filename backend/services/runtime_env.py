"""Runtime environment normalization helpers."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import SplitResult, urlsplit, urlunsplit

_DOCKER_ENV = Path("/.dockerenv")
_LOCALHOST_REWRITE_HOSTS = {"postgres"}


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


def normalize_database_url_for_host_runtime(
    env_var: str = "DATABASE_URL",
) -> str | None:
    """Rewrite compose-only PostgreSQL hostnames to localhost for host-side runs."""

    raw = (os.getenv(env_var) or "").strip()
    if not raw or _running_inside_container():
        return raw or None

    parsed = urlsplit(raw)
    if parsed.scheme not in {"postgresql", "postgres"}:
        return raw

    host = parsed.hostname
    if host not in _LOCALHOST_REWRITE_HOSTS:
        return raw

    rewritten = urlunsplit(
        (
            parsed.scheme,
            _rewrite_database_netloc(parsed, "127.0.0.1"),
            parsed.path,
            parsed.query,
            parsed.fragment,
        )
    )
    os.environ[env_var] = rewritten
    return rewritten
