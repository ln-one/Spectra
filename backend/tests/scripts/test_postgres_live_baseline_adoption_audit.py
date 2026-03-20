from pathlib import Path

from scripts.postgres_live_baseline_adoption_audit import (
    evaluate_live_baseline_adoption_readiness,
)


def test_live_baseline_adoption_audit_passes(tmp_path: Path) -> None:
    candidate_root = tmp_path / "candidate"
    migration_dir = candidate_root / "migrations" / "00000000000000_postgres_baseline"
    migration_dir.mkdir(parents=True)
    (candidate_root / "README.md").write_text("candidate\n", encoding="utf-8")
    (candidate_root / "sqlite-history-manifest.json").write_text(
        '{"strategy": "fresh-baseline-cutover", "legacy_sqlite_migrations": ["a"]}\n',
        encoding="utf-8",
    )
    (candidate_root / "migrations" / "migration_lock.toml").write_text(
        'provider = "postgresql"\n', encoding="utf-8"
    )
    (migration_dir / "migration.sql").write_text(
        "CREATE TABLE demo ();\n", encoding="utf-8"
    )

    messages, failures = evaluate_live_baseline_adoption_readiness(
        {}, candidate_root=candidate_root
    )

    assert failures == 0
    assert any("candidate migration lock targets PostgreSQL" in m for m in messages)
    assert any(
        "legacy manifest strategy is fresh-baseline-cutover" in m for m in messages
    )


def test_live_baseline_adoption_audit_fails_when_candidate_missing(
    tmp_path: Path,
) -> None:
    messages, failures = evaluate_live_baseline_adoption_readiness(
        {}, candidate_root=tmp_path / "missing"
    )

    assert failures == 1
    assert any("live baseline candidate missing" in m for m in messages)
