#!/usr/bin/env python3
"""Preflight checks for demo/main deployment environments."""

from __future__ import annotations

import argparse
import os
import socket
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping
from urllib.parse import urlparse


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
    tcp_check: Callable[[str, int, float], tuple[bool, str]] = _tcp_check,
) -> tuple[list[str], int]:
    messages = ["Deployment preflight"]
    env_messages, failures = _iter_env_results(ENV_CHECKS, env.get)

    messages.extend(env_messages)

    if skip_network:
        return messages, failures

    database_url = env.get("DATABASE_URL")
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
    args = parser.parse_args()

    messages, failures = evaluate_preflight(
        os.environ,
        skip_network=args.skip_network,
        timeout_seconds=args.timeout_seconds,
    )
    for message in messages:
        print(message)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
