#!/usr/bin/env python3
"""Audit PostgreSQL backup/restore toolchain readiness for cutover."""

from __future__ import annotations

import os
import shutil
from typing import Callable, Mapping


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def evaluate_postgres_toolchain(
    env: Mapping[str, str],
    *,
    which: Callable[[str], str | None] = shutil.which,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL toolchain readiness audit"]
    failures = 0

    use_docker = _is_truthy(env.get("POSTGRES_BACKUP_USE_DOCKER"))
    if use_docker:
        docker_bin = (env.get("DOCKER_BIN") or "docker").strip() or "docker"
        if which(docker_bin):
            messages.append(
                _format(
                    "PASS",
                    f"Docker backup/restore fallback available via `{docker_bin}`",
                )
            )
        else:
            failures += 1
            messages.append(
                _format(
                    "FAIL",
                    (
                        "POSTGRES_BACKUP_USE_DOCKER is enabled but the docker "
                        f"binary `{docker_bin}` is not available"
                    ),
                )
            )

    required_bins = (
        ("PG_DUMP_BIN", "pg_dump"),
        ("PG_RESTORE_BIN", "pg_restore"),
        ("PSQL_BIN", "psql"),
    )
    missing: list[str] = []
    for env_key, default_bin in required_bins:
        binary = (env.get(env_key) or default_bin).strip() or default_bin
        resolved = which(binary)
        if resolved:
            messages.append(
                _format("PASS", f"{env_key} resolved via `{binary}` ({resolved})")
            )
        else:
            missing.append(f"{env_key}=`{binary}`")

    if missing and not use_docker:
        failures += 1
        messages.append(
            _format(
                "FAIL",
                ("PostgreSQL CLI tools missing for cutover: " + ", ".join(missing)),
            )
        )
    elif missing:
        messages.append(
            _format(
                "WARN",
                (
                    "PostgreSQL CLI tools missing locally, but Docker fallback is "
                    "enabled: " + ", ".join(missing)
                ),
            )
        )
    else:
        messages.append(
            _format("PASS", "PostgreSQL CLI toolchain available for backup/restore")
        )

    return messages, failures


def main() -> int:
    messages, failures = evaluate_postgres_toolchain(os.environ)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
