from pathlib import Path

from scripts.postgres_shadow_env import build_shadow_env_overlay, merge_shadow_env


def test_build_shadow_env_overlay_uses_shadow_url_and_defaults() -> None:
    overlay = build_shadow_env_overlay(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow-db"}
    )

    assert overlay["DATABASE_URL"] == "postgresql://shadow-db"
    assert overlay["JWT_SECRET_KEY"] == "spectra-shadow-local-jwt-secret"
    assert overlay["REDIS_HOST"] == "redis"
    assert overlay["STRATUMIND_BASE_URL"] == "http://stratumind:8110"
    assert overlay["STRATUMIND_TIMEOUT_SECONDS"] == "15"
    assert overlay["QDRANT_URL"] == "http://qdrant:6333"
    assert overlay["UPLOAD_DIR"] == "/var/lib/spectra/uploads"
    assert overlay["ARTIFACT_STORAGE_DIR"] == "/var/lib/spectra/artifacts"
    assert overlay["GENERATED_DIR"] == "/var/lib/spectra/generated"
    assert overlay["POSTGRES_BACKUP_DIR"] == "/var/lib/spectra/backups"
    assert overlay["POSTGRES_RESTORE_STAGING_DIR"] == "/var/lib/spectra/restore-staging"
    assert overlay["POSTGRES_BACKUP_USE_DOCKER"] == "1"
    assert overlay["DEFAULT_MODEL"] == "qwen-plus"
    assert overlay["LARGE_MODEL"] == "qwen-max"
    assert overlay["SMALL_MODEL"] == "qwen-turbo"
    assert overlay["AI_REQUEST_TIMEOUT_SECONDS"] == "240"
    assert overlay["WORKER_NAME"] == "shadow-worker"
    assert overlay["WORKER_RECOVERY_SCAN"] == "true"
    assert overlay["SYNC_RAG_INDEXING"] == "false"


def test_merge_shadow_env_preserves_unrelated_values(tmp_path: Path) -> None:
    merged = merge_shadow_env(
        {
            "POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow-db",
            "DEFAULT_MODEL": "qwen-plus",
            "JWT_SECRET_KEY": "already-set",
        },
        base_dir=tmp_path,
    )

    assert merged["DATABASE_URL"] == "postgresql://shadow-db"
    assert merged["DEFAULT_MODEL"] == "qwen-plus"
    assert merged["JWT_SECRET_KEY"] == "already-set"
    assert merged["UPLOAD_DIR"] == "/var/lib/spectra/uploads"
