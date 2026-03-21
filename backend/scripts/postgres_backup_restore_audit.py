#!/usr/bin/env python3
"""Audit PostgreSQL backup/restore readiness for cutover and cloud deployment."""

from __future__ import annotations

from typing import Mapping
from urllib.parse import urlparse

try:
    from scripts.env_bootstrap import build_script_env
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    from env_bootstrap import build_script_env

RECOMMENDED_BACKUP_ROOTS = (
    "/var/backups/spectra",
    "/var/lib/spectra/backups",
)


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _database_scheme(url: str | None) -> str | None:
    value = (url or "").strip()
    if not value:
        return None
    if value.startswith("file:"):
        return "sqlite"
    return urlparse(value).scheme or None


def _is_absolute_storage_path(value: str) -> bool:
    return value.startswith("/")


def _looks_runtime_local(value: str) -> bool:
    return (
        value.startswith("./")
        or value.startswith("../")
        or value
        in {
            "backup",
            "backups",
        }
    )


def evaluate_backup_restore_readiness(
    env: Mapping[str, str],
) -> tuple[list[str], int]:
    messages = ["PostgreSQL backup/restore readiness audit"]
    failures = 0

    scheme = _database_scheme(env.get("DATABASE_URL"))
    if scheme == "postgresql":
        messages.append(
            _format("PASS", "DATABASE_URL uses PostgreSQL-compatible scheme")
        )
    elif scheme == "sqlite":
        failures += 1
        messages.append(
            _format(
                "FAIL",
                (
                    "DATABASE_URL still points to sqlite; "
                    "backup/restore flow is not cutover-ready"
                ),
            )
        )
    else:
        failures += 1
        messages.append(_format("FAIL", "DATABASE_URL is not using PostgreSQL"))

    backup_dir = (env.get("POSTGRES_BACKUP_DIR") or "").strip()
    if not backup_dir:
        failures += 1
        messages.append(_format("FAIL", "POSTGRES_BACKUP_DIR missing"))
    elif _looks_runtime_local(backup_dir) or not _is_absolute_storage_path(backup_dir):
        failures += 1
        messages.append(
            _format("FAIL", "POSTGRES_BACKUP_DIR must point to an absolute shared path")
        )
    elif any(backup_dir.startswith(prefix) for prefix in RECOMMENDED_BACKUP_ROOTS):
        messages.append(
            _format(
                "PASS",
                f"POSTGRES_BACKUP_DIR points to shared backup path `{backup_dir}`",
            )
        )
    else:
        messages.append(
            _format(
                "WARN",
                (
                    "POSTGRES_BACKUP_DIR is absolute but outside "
                    f"recommended backup roots: `{backup_dir}`"
                ),
            )
        )

    restore_dir = (env.get("POSTGRES_RESTORE_STAGING_DIR") or "").strip()
    if not restore_dir:
        messages.append(_format("WARN", "POSTGRES_RESTORE_STAGING_DIR missing"))
    elif _looks_runtime_local(restore_dir) or not _is_absolute_storage_path(
        restore_dir
    ):
        failures += 1
        messages.append(
            _format(
                "FAIL",
                "POSTGRES_RESTORE_STAGING_DIR must point to an absolute shared path",
            )
        )
    else:
        messages.append(
            _format(
                "PASS",
                (
                    "POSTGRES_RESTORE_STAGING_DIR points to shared "
                    f"restore staging path `{restore_dir}`"
                ),
            )
        )

    retention = (env.get("POSTGRES_BACKUP_RETENTION_DAYS") or "").strip()
    if not retention:
        messages.append(_format("WARN", "POSTGRES_BACKUP_RETENTION_DAYS missing"))
    else:
        try:
            days = int(retention)
        except ValueError:
            failures += 1
            messages.append(
                _format("FAIL", "POSTGRES_BACKUP_RETENTION_DAYS must be an integer")
            )
        else:
            if days <= 0:
                failures += 1
                messages.append(
                    _format("FAIL", "POSTGRES_BACKUP_RETENTION_DAYS must be positive")
                )
            else:
                messages.append(
                    _format("PASS", f"POSTGRES_BACKUP_RETENTION_DAYS set to {days}")
                )

    prefix = (env.get("POSTGRES_BACKUP_PREFIX") or "").strip()
    if prefix:
        messages.append(
            _format("PASS", f"POSTGRES_BACKUP_PREFIX configured as `{prefix}`")
        )
    else:
        messages.append(_format("WARN", "POSTGRES_BACKUP_PREFIX missing"))

    return messages, failures


def main() -> int:
    messages, failures = evaluate_backup_restore_readiness(build_script_env())
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
