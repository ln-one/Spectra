from pathlib import Path

from scripts.postgres_baseline_promotion_audit import (
    evaluate_baseline_promotion_readiness,
)


def test_baseline_promotion_audit_flags_missing_package(tmp_path: Path):
    messages, failures = evaluate_baseline_promotion_readiness(
        {}, package_root=tmp_path / "missing-package"
    )

    assert failures > 0
    assert any("baseline package root missing" in message for message in messages)


def test_baseline_promotion_audit_accepts_valid_package(tmp_path: Path):
    package_root = tmp_path / "postgres-baseline-package"
    migrations = package_root / "migrations"
    migrations.mkdir(parents=True)
    (package_root / "README.md").write_text("# Draft\n", encoding="utf-8")
    (migrations / "migration_lock.toml").write_text(
        'provider = "postgresql"\n', encoding="utf-8"
    )
    draft_dir = migrations / "00000000000000_postgres_baseline"
    draft_dir.mkdir()
    (draft_dir / "migration.sql").write_text("-- baseline\n", encoding="utf-8")

    messages, failures = evaluate_baseline_promotion_readiness(
        {}, package_root=package_root
    )

    assert failures == 0
    assert any("migration lock targets PostgreSQL" in message for message in messages)
    assert any("baseline migration SQL populated" in message for message in messages)
