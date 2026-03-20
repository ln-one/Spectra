#!/usr/bin/env python3
"""Live smoke gate for a PostgreSQL shadow stack."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Callable, Mapping

from scripts.deploy_smoke_check import run_smoke_checks
from scripts.postgres_cutover_audit import (
    _read_prisma_provider,
    evaluate_cutover_readiness,
)

ROOT = Path(__file__).resolve().parents[2]
BASE_COMPOSE = ROOT / "docker-compose.yml"
SHADOW_COMPOSE = ROOT / "docker-compose.postgres-shadow.yml"


def _prefix(section: str, messages: list[str]) -> list[str]:
    return [f"[{section}] {message}" for message in messages]


def evaluate_shadow_smoke(
    env: Mapping[str, str],
    *,
    base_url: str,
    token: str | None,
    prisma_provider: str | None,
    base_compose_text: str | None,
    shadow_compose_text: str | None,
    include_cutover_audit: bool = True,
    cutover_eval: Callable[..., tuple[list[str], int]] = evaluate_cutover_readiness,
    smoke_eval: Callable[..., tuple[list[str], int]] = run_smoke_checks,
) -> tuple[list[str], int]:
    messages = [f"PostgreSQL shadow smoke against {base_url}"]
    failures = 0

    if include_cutover_audit:
        cutover_messages, cutover_failures = cutover_eval(
            env,
            prisma_provider=prisma_provider,
            base_compose_text=base_compose_text,
            shadow_compose_text=shadow_compose_text,
        )
        messages.extend(_prefix("cutover", cutover_messages[1:]))
        failures += cutover_failures

    smoke_messages, smoke_failures = smoke_eval(base_url=base_url, token=token)
    messages.extend(_prefix("smoke", smoke_messages[1:]))
    failures += smoke_failures

    return messages, failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL for shadow backend smoke checks",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional bearer token for authenticated smoke checks",
    )
    parser.add_argument(
        "--skip-cutover-audit",
        action="store_true",
        help="Only run live smoke checks and skip the static cutover audit",
    )
    args = parser.parse_args()

    base_text = (
        BASE_COMPOSE.read_text(encoding="utf-8") if BASE_COMPOSE.exists() else None
    )
    shadow_text = (
        SHADOW_COMPOSE.read_text(encoding="utf-8") if SHADOW_COMPOSE.exists() else None
    )
    messages, failures = evaluate_shadow_smoke(
        os.environ,
        base_url=args.base_url.rstrip("/"),
        token=args.token,
        prisma_provider=_read_prisma_provider(),
        base_compose_text=base_text,
        shadow_compose_text=shadow_text,
        include_cutover_audit=not args.skip_cutover_audit,
    )
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
