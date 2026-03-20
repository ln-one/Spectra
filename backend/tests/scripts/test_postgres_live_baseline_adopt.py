from pathlib import Path

from scripts.postgres_live_baseline_adopt import adopt_live_baseline


def _write_candidate(root: Path) -> None:
    migration_dir = root / "migrations" / "00000000000000_postgres_baseline"
    migration_dir.mkdir(parents=True)
    (root / "README.md").write_text("candidate\n", encoding="utf-8")
    (root / "sqlite-history-manifest.json").write_text(
        '{"strategy": "fresh-baseline-cutover", "legacy_sqlite_migrations": ["a", "b"]}\n',
        encoding="utf-8",
    )
    (root / "migrations" / "migration_lock.toml").write_text(
        'provider = "postgresql"\n', encoding="utf-8"
    )
    (migration_dir / "migration.sql").write_text(
        "CREATE TABLE demo ();\n", encoding="utf-8"
    )


def test_live_baseline_adopt_dry_run_reports_plan(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    live = tmp_path / "live"
    archive = tmp_path / "archive"
    _write_candidate(candidate)
    (live / "migration_lock.toml").parent.mkdir(parents=True)
    (live / "migration_lock.toml").write_text('provider = "sqlite"\n', encoding="utf-8")

    messages, failures = adopt_live_baseline(
        {},
        candidate_root=candidate,
        live_migrations_root=live,
        archive_root=archive,
        adoption_tag="demo",
        apply=False,
    )

    assert failures == 0
    assert any("Dry run only" in m for m in messages)
    assert not (archive / "demo").exists()
    assert (live / "migration_lock.toml").read_text(
        encoding="utf-8"
    ).strip() == 'provider = "sqlite"'


def test_live_baseline_adopt_applies_candidate_and_archives_legacy(
    tmp_path: Path,
) -> None:
    candidate = tmp_path / "candidate"
    live = tmp_path / "live"
    archive = tmp_path / "archive"
    _write_candidate(candidate)
    old_dir = live / "20260101000000_init"
    old_dir.mkdir(parents=True)
    (live / "migration_lock.toml").write_text('provider = "sqlite"\n', encoding="utf-8")
    (old_dir / "migration.sql").write_text("-- sqlite legacy\n", encoding="utf-8")

    messages, failures = adopt_live_baseline(
        {},
        candidate_root=candidate,
        live_migrations_root=live,
        archive_root=archive,
        adoption_tag="demo",
        apply=True,
    )

    assert failures == 0
    assert any("archived prior live migrations" in m for m in messages)
    assert (
        archive / "demo" / "migrations" / "20260101000000_init" / "migration.sql"
    ).exists()
    assert (archive / "demo" / "archive-manifest.json").exists()
    assert (live / "migration_lock.toml").read_text(
        encoding="utf-8"
    ).strip() == 'provider = "postgresql"'
    assert (live / "00000000000000_postgres_baseline" / "migration.sql").exists()
