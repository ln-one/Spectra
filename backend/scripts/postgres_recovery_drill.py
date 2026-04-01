#!/usr/bin/env python3
"""Dry-run a PostgreSQL backup/restore recovery drill for cutover readiness."""

from __future__ import annotations

import argparse
import os
from datetime import datetime
from typing import Mapping

try:
    from scripts._script_bootstrap import ensure_backend_import_path
except ModuleNotFoundError:
    from _script_bootstrap import ensure_backend_import_path

ensure_backend_import_path()

from scripts import postgres_backup as backup_script  # noqa: E402
from scripts import postgres_backup_restore_audit as backup_audit  # noqa: E402
from scripts import postgres_restore as restore_script  # noqa: E402
from scripts import postgres_toolchain_audit as toolchain_audit  # noqa: E402

evaluate_postgres_toolchain = toolchain_audit.evaluate_postgres_toolchain


def _prefix(section: str, messages: list[str]) -> list[str]:
    return [f"[{section}] {message}" for message in messages]


def evaluate_recovery_drill(
    env: Mapping[str, str],
    *,
    now: datetime | None = None,
) -> tuple[list[str], int]:
    messages = ["PostgreSQL recovery drill"]
    failures = 0

    backup_audit_messages, backup_audit_failures = (
        backup_audit.evaluate_backup_restore_readiness(env)
    )
    messages.extend(_prefix("backup-audit", backup_audit_messages[1:]))
    failures += backup_audit_failures

    toolchain_messages, toolchain_failures = evaluate_postgres_toolchain(env)
    messages.extend(_prefix("toolchain", toolchain_messages[1:]))
    failures += toolchain_failures

    if failures:
        messages.append(
            (
                "[drill] FAIL backup/restore prerequisites are not ready "
                "for a recovery drill"
            )
        )
        return messages, failures

    backup_path = backup_script.build_backup_path(env, now=now)
    backup_command = backup_script.build_backup_command(env, output_path=backup_path)
    messages.append(
        "[drill] PASS backup artifact would be created at "
        f"`{backup_path.as_posix()}`"
    )
    messages.append(f"[drill] PASS backup command prepared: {' '.join(backup_command)}")

    staged_path = restore_script.stage_restore_input(backup_path, env)
    restore_command = restore_script.build_restore_command(env, backup_path=backup_path)
    messages.append(
        f"[drill] PASS restore staging path resolves to `{staged_path.as_posix()}`"
    )
    messages.append(
        f"[drill] PASS restore command prepared: {' '.join(restore_command)}"
    )

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--timestamp",
        default=None,
        help="Optional timestamp override in YYYYMMDD-HHMMSS format.",
    )
    args = parser.parse_args()

    now = None
    if args.timestamp:
        now = datetime.strptime(args.timestamp, "%Y%m%d-%H%M%S")

    messages, failures = evaluate_recovery_drill(os.environ, now=now)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
