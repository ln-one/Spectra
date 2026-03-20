#!/usr/bin/env python3
"""Audit local storage assumptions that block distributed deployment."""

from __future__ import annotations

import os
from typing import Mapping

LOCAL_RELATIVE_PREFIXES = ("./", "../")
LOCAL_RUNTIME_DEFAULTS = {
    "UPLOAD_DIR": "uploads",
    "ARTIFACT_STORAGE_DIR": "uploads/artifacts",
    "GENERATED_DIR": "generated",
    "CHROMA_PERSIST_DIR": "./chroma_data",
}


def _format(kind: str, message: str) -> str:
    return f"{kind} {message}"


def _looks_process_local(path: str) -> bool:
    normalized = path.strip()
    if not normalized:
        return False
    if normalized.startswith(LOCAL_RELATIVE_PREFIXES):
        return True
    return not normalized.startswith("/")


def _check_storage_path(name: str, value: str | None) -> tuple[list[str], int]:
    expected_default = LOCAL_RUNTIME_DEFAULTS[name]
    configured = (value or "").strip()

    if not configured:
        return [
            _format(
                "WARN",
                (
                    f"{name} not configured; runtime currently falls back to "
                    f"`{expected_default}`"
                ),
            )
        ], 0

    if configured == expected_default:
        return [
            _format(
                "WARN",
                f"{name} still uses local default `{configured}`",
            )
        ], 0

    if _looks_process_local(configured):
        return [
            _format(
                "WARN",
                f"{name} uses process-local relative path `{configured}`",
            )
        ], 0

    return [_format("PASS", f"{name} points to `{configured}`")], 0


def evaluate_storage_readiness(env: Mapping[str, str]) -> tuple[list[str], int]:
    messages = ["Storage deployment readiness audit"]
    failures = 0

    for name in (
        "UPLOAD_DIR",
        "ARTIFACT_STORAGE_DIR",
        "GENERATED_DIR",
        "CHROMA_PERSIST_DIR",
    ):
        path_messages, path_failures = _check_storage_path(name, env.get(name))
        messages.extend(path_messages)
        failures += path_failures

    if not env.get("UPLOAD_DIR") and not env.get("ARTIFACT_STORAGE_DIR"):
        messages.append(
            _format(
                "WARN",
                "file uploads and artifacts still rely on repo-local storage defaults",
            )
        )

    if not env.get("GENERATED_DIR"):
        messages.append(
            _format(
                "WARN",
                "generation outputs still rely on local `generated` directory",
            )
        )

    return messages, failures


def main() -> int:
    messages, failures = evaluate_storage_readiness(os.environ)
    for message in messages:
        print(message)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
