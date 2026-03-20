"""Centralized runtime storage paths for local and deployed environments."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_UPLOAD_DIR = "uploads"
DEFAULT_ARTIFACT_STORAGE_DIR = "uploads/artifacts"
DEFAULT_GENERATED_DIR = "generated"
DEFAULT_CHROMA_PERSIST_DIR = "chroma_data"


def _resolve_dir(env_key: str, default: str) -> Path:
    value = os.getenv(env_key, default).strip() or default
    return Path(value)


def get_upload_dir() -> Path:
    return _resolve_dir("UPLOAD_DIR", DEFAULT_UPLOAD_DIR)


def get_artifact_storage_dir() -> Path:
    return _resolve_dir("ARTIFACT_STORAGE_DIR", DEFAULT_ARTIFACT_STORAGE_DIR)


def get_generated_dir() -> Path:
    return _resolve_dir("GENERATED_DIR", DEFAULT_GENERATED_DIR)


def get_chroma_persist_dir() -> Path:
    return _resolve_dir("CHROMA_PERSIST_DIR", DEFAULT_CHROMA_PERSIST_DIR)
