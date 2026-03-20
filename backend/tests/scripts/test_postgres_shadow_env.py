from pathlib import Path

from scripts.postgres_shadow_env import build_shadow_env_overlay, merge_shadow_env


def test_build_shadow_env_overlay_uses_shadow_url_and_defaults(tmp_path: Path) -> None:
    overlay = build_shadow_env_overlay(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow-db"},
        base_dir=tmp_path,
    )

    assert overlay["DATABASE_URL"] == "postgresql://shadow-db"
    assert overlay["JWT_SECRET_KEY"] == "spectra-shadow-local-jwt-secret"
    assert overlay["POSTGRES_BACKUP_DIR"] == str(tmp_path / "backups")
    assert overlay["POSTGRES_RESTORE_STAGING_DIR"] == str(tmp_path / "restore-staging")
    assert overlay["POSTGRES_BACKUP_USE_DOCKER"] == "1"


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
