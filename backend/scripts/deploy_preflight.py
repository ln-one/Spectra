#!/usr/bin/env python3
"""Preflight checks for demo/main deployment environments."""

from __future__ import annotations

import argparse
import os
import socket
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping
from urllib.parse import urlparse

LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}


@dataclass(frozen=True)
class EnvCheck:
    key: str
    required: bool
    description: str


ENV_CHECKS: tuple[EnvCheck, ...] = (
    EnvCheck("DATABASE_URL", True, "primary database connection string"),
    EnvCheck("JWT_SECRET_KEY", True, "JWT signing secret"),
    EnvCheck("DEFAULT_MODEL", False, "default AI model routing target"),
    EnvCheck("LARGE_MODEL", False, "large AI model routing target"),
    EnvCheck("SMALL_MODEL", False, "small AI model routing target"),
    EnvCheck("DASHSCOPE_API_KEY", False, "provider key for video/LLM/embedding"),
    EnvCheck("REDIS_HOST", False, "queue/cache host"),
    EnvCheck("REDIS_PORT", False, "queue/cache port"),
    EnvCheck("CHROMA_HOST", False, "remote Chroma host"),
    EnvCheck("CHROMA_PORT", False, "remote Chroma port"),
)


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _is_placeholder_secret(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered in {
        "",
        "your-super-secret-key-change-in-production",
        "change-me",
        "replace-me",
    }


def _tcp_check(host: str, port: int, timeout_seconds: float) -> tuple[bool, str]:
    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            return True, _format("PASS", f"tcp {host}:{port} reachable")
    except OSError as exc:
        return False, _format("FAIL", f"tcp {host}:{port} unreachable ({exc})")


def _database_socket_target(database_url: str) -> tuple[str, int] | None:
    parsed = urlparse(database_url)
    if not parsed.hostname:
        return None
    return parsed.hostname, parsed.port or 5432


def _database_scheme(database_url: str | None) -> str | None:
    if not database_url:
        return None
    if database_url.startswith("file:"):
        return "sqlite"
    parsed = urlparse(database_url)
    return parsed.scheme or None


def _check_database_contract(
    database_url: str | None,
    *,
    require_postgres: bool,
    allow_local_host: bool = False,
) -> tuple[list[str], int]:
    if not database_url:
        return [], 0

    messages: list[str] = []
    failures = 0
    scheme = _database_scheme(database_url)
    parsed = urlparse(database_url)
    host = parsed.hostname

    if require_postgres:
        if scheme not in {"postgresql", "postgres"}:
            messages.append(
                _format(
                    "FAIL",
                    "DATABASE_URL is not using PostgreSQL "
                    "while --require-postgres is enabled",
                )
            )
            failures += 1
        else:
            messages.append(
                _format("PASS", "DATABASE_URL uses PostgreSQL-compatible scheme")
            )
    elif scheme == "sqlite":
        messages.append(
            _format(
                "WARN",
                "DATABASE_URL still points to sqlite; "
                "this is fine for local dev only",
            )
        )

    if require_postgres and host in LOCAL_HOSTS and not allow_local_host:
        messages.append(
            _format(
                "FAIL",
                f"DATABASE_URL host `{host}` is local-only "
                "while --require-postgres is enabled",
            )
        )
        failures += 1
    elif require_postgres and host in LOCAL_HOSTS:
        messages.append(
            _format(
                "PASS",
                (
                    f"DATABASE_URL host `{host}` is local-only, but this is "
                    "allowed for shadow rehearsal"
                ),
            )
        )
    elif host in LOCAL_HOSTS:
        messages.append(
            _format(
                "WARN",
                f"DATABASE_URL host `{host}` is local-only; verify deployment topology",
            )
        )

    return messages, failures


def _iter_env_results(
    checks: Iterable[EnvCheck],
    env_get: Callable[[str], str | None] = os.getenv,
) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0

    for check in checks:
        value = env_get(check.key)
        if value:
            if check.key == "JWT_SECRET_KEY" and _is_placeholder_secret(value):
                messages.append(
                    _format(
                        "FAIL",
                        (
                            "JWT_SECRET_KEY is still using a placeholder "
                            "development secret"
                        ),
                    )
                )
                failures += 1
            else:
                messages.append(_format("PASS", f"{check.key} configured"))
            continue

        if check.required:
            messages.append(
                _format("FAIL", f"{check.key} missing ({check.description})")
            )
            failures += 1
        else:
            messages.append(
                _format("WARN", f"{check.key} missing ({check.description})")
            )

    return messages, failures


def evaluate_preflight(
    env: Mapping[str, str],
    *,
    skip_network: bool,
    timeout_seconds: float,
    require_postgres: bool = False,
    allow_local_host: bool = False,
    tcp_check: Callable[[str, int, float], tuple[bool, str]] = _tcp_check,
) -> tuple[list[str], int]:
    messages = ["Deployment preflight"]
    env_messages, failures = _iter_env_results(ENV_CHECKS, env.get)

    messages.extend(env_messages)

    database_url = env.get("DATABASE_URL")
    contract_messages, contract_failures = _check_database_contract(
        database_url,
        require_postgres=require_postgres,
        allow_local_host=allow_local_host,
    )
    messages.extend(contract_messages)
    failures += contract_failures

    if skip_network:
        return messages, failures

    if database_url:
        target = _database_socket_target(database_url)
        if target is None:
            messages.append(
                _format("FAIL", "DATABASE_URL could not be parsed into host/port")
            )
            failures += 1
        else:
            ok, message = tcp_check(*target, timeout_seconds)
            messages.append(message)
            if not ok:
                failures += 1

    redis_host = env.get("REDIS_HOST")
    redis_port = env.get("REDIS_PORT")
    if redis_host and redis_port:
        ok, message = tcp_check(redis_host, int(redis_port), timeout_seconds)
        messages.append(message)
        if not ok:
            failures += 1

    chroma_host = env.get("CHROMA_HOST")
    chroma_port = env.get("CHROMA_PORT")
    if chroma_host and chroma_port:
        ok, message = tcp_check(chroma_host, int(chroma_port), timeout_seconds)
        messages.append(message)
        if not ok:
            failures += 1

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=1.5,
        help="TCP connectivity timeout in seconds",
    )
    parser.add_argument(
        "--skip-network",
        action="store_true",
        help="Only validate environment variables; skip TCP reachability checks",
    )
    parser.add_argument(
        "--require-postgres",
        action="store_true",
        help=(
            "Fail when DATABASE_URL is not PostgreSQL "
            "or still points at a local-only host"
        ),
    )
    parser.add_argument(
        "--allow-local-host",
        action="store_true",
        help=(
            "Allow localhost/127.0.0.1 DATABASE_URL hosts when "
            "--require-postgres is enabled; intended for shadow rehearsal only."
        ),
    )
    args = parser.parse_args()

    messages, failures = evaluate_preflight(
        os.environ,
        skip_network=args.skip_network,
        timeout_seconds=args.timeout_seconds,
        require_postgres=args.require_postgres,
        allow_local_host=args.allow_local_host,
    )
    for message in messages:
        print(message)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
