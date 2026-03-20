#!/usr/bin/env python3
"""Role-aware deployment environment audit."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class RoleContract:
    required: tuple[str, ...]
    recommended: tuple[str, ...]


ROLE_CONTRACTS: dict[str, RoleContract] = {
    "backend": RoleContract(
        required=(
            "DATABASE_URL",
            "JWT_SECRET_KEY",
        ),
        recommended=(
            "DEFAULT_MODEL",
            "LARGE_MODEL",
            "SMALL_MODEL",
            "AI_REQUEST_TIMEOUT_SECONDS",
            "REDIS_HOST",
            "REDIS_PORT",
            "CHROMA_HOST",
            "CHROMA_PORT",
        ),
    ),
    "worker": RoleContract(
        required=(
            "DATABASE_URL",
            "JWT_SECRET_KEY",
        ),
        recommended=(
            "DEFAULT_MODEL",
            "LARGE_MODEL",
            "SMALL_MODEL",
            "AI_REQUEST_TIMEOUT_SECONDS",
            "REDIS_HOST",
            "REDIS_PORT",
            "CHROMA_HOST",
            "CHROMA_PORT",
            "WORKER_NAME",
            "WORKER_RECOVERY_SCAN",
        ),
    ),
}


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def evaluate_role_contract(
    role: str,
    env: Mapping[str, str],
) -> tuple[list[str], int]:
    contract = ROLE_CONTRACTS[role]
    messages = [f"Deployment env role audit: {role}"]
    failures = 0

    for key in contract.required:
        value = env.get(key, "").strip()
        if value:
            messages.append(_format("PASS", f"required {key} configured"))
        else:
            failures += 1
            messages.append(_format("FAIL", f"required {key} missing"))

    for key in contract.recommended:
        value = env.get(key, "").strip()
        if value:
            messages.append(_format("PASS", f"recommended {key} configured"))
        else:
            messages.append(_format("WARN", f"recommended {key} missing"))

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "role",
        choices=sorted(ROLE_CONTRACTS),
        help="deployment role to audit",
    )
    args = parser.parse_args()

    messages, failures = evaluate_role_contract(args.role, os.environ)
    for message in messages:
        print(message)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
