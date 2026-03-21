#!/usr/bin/env python3
"""Preflight checks for demo/main deployment environments."""

from __future__ import annotations

import argparse
import os
import shutil
import socket
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping
from urllib.parse import urlparse

try:
    from scripts.env_bootstrap import build_script_env
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    from env_bootstrap import build_script_env

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
    EnvCheck("AI_REQUEST_TIMEOUT_SECONDS", False, "AI request timeout seconds"),
    EnvCheck(
        "PREVIEW_REBUILD_TIMEOUT_SECONDS",
        False,
        "preview rebuild timeout seconds",
    ),
    EnvCheck(
        "TOOL_CHECK_CACHE_TTL_SECONDS",
        False,
        "generation tool check cache TTL seconds",
    ),
    EnvCheck(
        "HEALTH_TOOL_TIMEOUT_SECONDS",
        False,
        "health endpoint generation tool probe timeout seconds",
    ),
    EnvCheck(
        "GENERATION_TOOLS_REQUIRED",
        False,
        "whether /health should enforce Marp/Pandoc availability",
    ),
    EnvCheck("DASHSCOPE_API_KEY", False, "provider key for video/LLM/embedding"),
    EnvCheck("REDIS_HOST", False, "queue/cache host"),
    EnvCheck("REDIS_PORT", False, "queue/cache port"),
    EnvCheck("CHROMA_HOST", False, "remote Chroma host"),
    EnvCheck("CHROMA_PORT", False, "remote Chroma port"),
    EnvCheck("UPLOAD_DIR", False, "upload file root path"),
    EnvCheck("ARTIFACT_STORAGE_DIR", False, "artifact storage root path"),
    EnvCheck("GENERATED_DIR", False, "generated files root path"),
)

TOOL_CHECKS: tuple[tuple[str, str], ...] = (
    ("marp", "Marp CLI for PPTX rendering"),
    ("pandoc", "Pandoc for DOCX rendering"),
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


def _looks_truthy(raw: str | None) -> bool:
    return (raw or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_positive_number(value: str | None) -> bool:
    if value is None:
        return False
    raw = value.strip()
    if not raw:
        return False
    try:
        return float(raw) > 0
    except ValueError:
        return False


def _is_non_negative_number(value: str | None) -> bool:
    if value is None:
        return False
    raw = value.strip()
    if not raw:
        return False
    try:
        return float(raw) >= 0
    except ValueError:
        return False


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


def _validate_runtime_env_contract(
    env_get: Callable[[str], str | None] = os.getenv,
) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0

    ai_timeout = env_get("AI_REQUEST_TIMEOUT_SECONDS")
    if ai_timeout:
        if _is_positive_number(ai_timeout):
            messages.append(_format("PASS", "AI_REQUEST_TIMEOUT_SECONDS is valid"))
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    "AI_REQUEST_TIMEOUT_SECONDS must be a positive number",
                )
            )

    preview_timeout = env_get("PREVIEW_REBUILD_TIMEOUT_SECONDS")
    if preview_timeout:
        if _is_positive_number(preview_timeout):
            messages.append(_format("PASS", "PREVIEW_REBUILD_TIMEOUT_SECONDS is valid"))
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    "PREVIEW_REBUILD_TIMEOUT_SECONDS must be a positive number",
                )
            )

    health_tool_timeout = env_get("HEALTH_TOOL_TIMEOUT_SECONDS")
    if health_tool_timeout:
        if _is_positive_number(health_tool_timeout):
            messages.append(_format("PASS", "HEALTH_TOOL_TIMEOUT_SECONDS is valid"))
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    "HEALTH_TOOL_TIMEOUT_SECONDS must be a positive number",
                )
            )

    tool_cache_ttl = env_get("TOOL_CHECK_CACHE_TTL_SECONDS")
    if tool_cache_ttl:
        if _is_non_negative_number(tool_cache_ttl):
            messages.append(_format("PASS", "TOOL_CHECK_CACHE_TTL_SECONDS is valid"))
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    "TOOL_CHECK_CACHE_TTL_SECONDS must be a non-negative number",
                )
            )

    for key in ("UPLOAD_DIR", "ARTIFACT_STORAGE_DIR", "GENERATED_DIR"):
        path_value = env_get(key)
        if not path_value:
            continue
        normalized = path_value.strip()
        if normalized.startswith("./") or normalized.startswith("../"):
            messages.append(
                _format(
                    "WARN",
                    (
                        f"{key} uses repo-relative path `{normalized}`; "
                        "prefer explicit runtime volume mount path in deployment"
                    ),
                )
            )

    if _looks_truthy(env_get("ALLOW_AI_STUB")):
        messages.append(
            _format(
                "WARN",
                "ALLOW_AI_STUB is enabled; production/demo should normally disable it",
            )
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
    validation_messages, validation_failures = _validate_runtime_env_contract(env.get)
    messages.extend(validation_messages)
    failures += validation_failures

    database_url = env.get("DATABASE_URL")
    contract_messages, contract_failures = _check_database_contract(
        database_url,
        require_postgres=require_postgres,
        allow_local_host=allow_local_host,
    )
    messages.extend(contract_messages)
    failures += contract_failures

    resolved_tools: dict[str, str | None] = {}
    for binary, description in TOOL_CHECKS:
        resolved = shutil.which(binary)
        resolved_tools[binary] = resolved
        if resolved:
            messages.append(_format("PASS", f"{binary} available at {resolved}"))
        else:
            messages.append(
                _format(
                    "WARN",
                    f"{binary} missing ({description}); generation chain may degrade",
                )
            )
    if _looks_truthy(env.get("GENERATION_TOOLS_REQUIRED")):
        missing_required_tools = [
            binary for binary, resolved in resolved_tools.items() if not resolved
        ]
        if missing_required_tools:
            failures += 1
            missing_text = ", ".join(missing_required_tools)
            messages.append(
                _format(
                    "FAIL",
                    (
                        "GENERATION_TOOLS_REQUIRED=true but required tools are "
                        "missing: "
                        f"{missing_text}"
                    ),
                )
            )
        else:
            messages.append(
                _format(
                    "PASS",
                    "GENERATION_TOOLS_REQUIRED=true and all required tools "
                    "are available",
                )
            )

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
        build_script_env(),
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
