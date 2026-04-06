#!/usr/bin/env python3
"""Build a local PostgreSQL shadow environment overlay for rehearsals."""

from __future__ import annotations

import argparse
import json
import os
import shlex
from pathlib import Path
from typing import Mapping

SHADOW_DATABASE_ENV = "POSTGRES_SHADOW_DATABASE_URL"
DEFAULT_SHADOW_DATABASE_URL = (
    "postgresql://spectra:spectra@127.0.0.1:5432/spectra_shadow"
)
DEFAULT_JWT_SECRET = "spectra-shadow-local-jwt-secret"
DEFAULT_RUNTIME_ROOT = "/var/lib/spectra"
DEFAULT_BASE_DIR = Path(DEFAULT_RUNTIME_ROOT)
DEFAULT_MODEL_NAME = "qwen-plus"
DEFAULT_LARGE_MODEL_NAME = "qwen-max"
DEFAULT_SMALL_MODEL_NAME = "qwen-turbo"
DEFAULT_AI_TIMEOUT_SECONDS = "240"


def build_shadow_env_overlay(
    env: Mapping[str, str],
    *,
    base_dir: Path = DEFAULT_BASE_DIR,
) -> dict[str, str]:
    shadow_database_url = (
        env.get(SHADOW_DATABASE_ENV)
        or env.get("DATABASE_URL")
        or DEFAULT_SHADOW_DATABASE_URL
    ).strip()
    backup_dir = (base_dir / "backups").as_posix()
    restore_dir = (base_dir / "restore-staging").as_posix()

    overlay = {
        "DATABASE_URL": shadow_database_url,
        "JWT_SECRET_KEY": (env.get("JWT_SECRET_KEY") or DEFAULT_JWT_SECRET).strip(),
        "REDIS_HOST": (env.get("REDIS_HOST") or "redis").strip(),
        "REDIS_PORT": (env.get("REDIS_PORT") or "6379").strip(),
        "CHROMA_HOST": (env.get("CHROMA_HOST") or "chromadb").strip(),
        "CHROMA_PORT": (env.get("CHROMA_PORT") or "8000").strip(),
        "UPLOAD_DIR": (
            env.get("UPLOAD_DIR") or f"{DEFAULT_RUNTIME_ROOT}/uploads"
        ).strip(),
        "ARTIFACT_STORAGE_DIR": (
            env.get("ARTIFACT_STORAGE_DIR") or f"{DEFAULT_RUNTIME_ROOT}/artifacts"
        ).strip(),
        "GENERATED_DIR": (
            env.get("GENERATED_DIR") or f"{DEFAULT_RUNTIME_ROOT}/generated"
        ).strip(),
        "CHROMA_PERSIST_DIR": (
            env.get("CHROMA_PERSIST_DIR") or f"{DEFAULT_RUNTIME_ROOT}/chroma"
        ).strip(),
        "POSTGRES_BACKUP_DIR": (env.get("POSTGRES_BACKUP_DIR") or backup_dir).strip(),
        "POSTGRES_RESTORE_STAGING_DIR": (
            env.get("POSTGRES_RESTORE_STAGING_DIR") or restore_dir
        ).strip(),
        "POSTGRES_BACKUP_RETENTION_DAYS": (
            env.get("POSTGRES_BACKUP_RETENTION_DAYS") or "7"
        ).strip(),
        "POSTGRES_BACKUP_PREFIX": (
            env.get("POSTGRES_BACKUP_PREFIX") or "spectra-shadow"
        ).strip(),
        "POSTGRES_BACKUP_USE_DOCKER": (
            env.get("POSTGRES_BACKUP_USE_DOCKER") or "1"
        ).strip(),
        "DEFAULT_MODEL": (env.get("DEFAULT_MODEL") or DEFAULT_MODEL_NAME).strip(),
        "LARGE_MODEL": (env.get("LARGE_MODEL") or DEFAULT_LARGE_MODEL_NAME).strip(),
        "SMALL_MODEL": (env.get("SMALL_MODEL") or DEFAULT_SMALL_MODEL_NAME).strip(),
        "AI_REQUEST_TIMEOUT_SECONDS": (
            env.get("AI_REQUEST_TIMEOUT_SECONDS") or DEFAULT_AI_TIMEOUT_SECONDS
        ).strip(),
        "WORKER_NAME": (env.get("WORKER_NAME") or "shadow-worker").strip(),
        "WORKER_RECOVERY_SCAN": (env.get("WORKER_RECOVERY_SCAN") or "true").strip(),
        "SYNC_RAG_INDEXING": (env.get("SYNC_RAG_INDEXING") or "false").strip(),
    }
    return overlay


def merge_shadow_env(
    env: Mapping[str, str],
    *,
    base_dir: Path = DEFAULT_BASE_DIR,
) -> dict[str, str]:
    merged = dict(env)
    merged.update(build_shadow_env_overlay(env, base_dir=base_dir))
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=DEFAULT_BASE_DIR,
        help="Base directory for generated backup and restore staging paths.",
    )
    parser.add_argument(
        "--format",
        choices=("json", "exports"),
        default="exports",
        help="Output format for the generated environment overlay.",
    )
    args = parser.parse_args()

    overlay = build_shadow_env_overlay(os.environ, base_dir=args.base_dir)
    if args.format == "json":
        print(json.dumps(overlay, indent=2, sort_keys=True))
    else:
        for key, value in overlay.items():
            print(f"export {key}={shlex.quote(value)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
