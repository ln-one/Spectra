#!/usr/bin/env python3
"""Static audit for the local PostgreSQL shadow stack."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_OVERRIDE = ROOT / "docker-compose.postgres-shadow.yml"


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def evaluate_shadow_stack(compose_text: str) -> tuple[list[str], int]:
    messages: list[str] = []
    failures = 0

    expectations = {
        "postgres_service": "  postgres:\n",
        "backend_service": "  backend:\n",
        "worker_service": "  worker:\n",
        "postgres_image": "image: postgres:",
        "postgres_healthcheck": "healthcheck:",
        "backend_url": "postgresql://spectra:spectra@postgres:5432/spectra_shadow",
        "worker_url": "postgresql://spectra:spectra@postgres:5432/spectra_shadow",
        "postgres_volume": "postgres_shadow_data:",
    }

    labels = {
        "postgres_service": "postgres service declared",
        "backend_service": "backend override declared",
        "worker_service": "worker override declared",
        "postgres_image": "PostgreSQL image configured",
        "postgres_healthcheck": "PostgreSQL healthcheck configured",
        "backend_url": "backend DATABASE_URL points to postgres shadow",
        "worker_url": "worker DATABASE_URL points to postgres shadow",
        "postgres_volume": "postgres shadow volume declared",
    }

    for key, token in expectations.items():
        if token in compose_text:
            messages.append(_format("PASS", labels[key]))
        else:
            failures += 1
            messages.append(_format("FAIL", labels[key]))

    if "127.0.0.1:5432:5432" in compose_text:
        messages.append(
            _format(
                "INFO",
                "PostgreSQL shadow port is loopback-bound for local validation",
            )
        )
    else:
        messages.append(
            _format(
                "WARN",
                "PostgreSQL shadow port binding is not loopback-scoped; "
                "verify exposure",
            )
        )

    return messages, failures


def main() -> int:
    if not COMPOSE_OVERRIDE.exists():
        print("PostgreSQL Shadow Stack Audit")
        print(f"- Override file: {COMPOSE_OVERRIDE}")
        print("FAIL postgres shadow compose override is missing")
        return 1

    messages, failures = evaluate_shadow_stack(
        COMPOSE_OVERRIDE.read_text(encoding="utf-8")
    )

    print("PostgreSQL Shadow Stack Audit")
    print(f"- Override file: {COMPOSE_OVERRIDE}")
    print()
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
