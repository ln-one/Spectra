from pathlib import Path

from scripts.postgres_live_baseline_candidate import scaffold_live_baseline_candidate


def test_scaffold_live_baseline_candidate_writes_candidate_tree(tmp_path: Path):
    package_root = tmp_path / "baseline-package"
    candidate_root = tmp_path / "live-candidate"
    legacy_root = tmp_path / "legacy-migrations"
    legacy_root.mkdir(parents=True)
    (legacy_root / "20260221114842_init").mkdir()
    (legacy_root / "20260302060243_add_rq_fields").mkdir()

    def fake_build_baseline_package(
        env,
        *,
        package_root,
        migration_tag=None,
        schema_output=None,
        run_diff=None,
    ):
        del env, migration_tag, schema_output, run_diff
        migrations = package_root / "migrations"
        draft_dir = migrations / "00000000000000_postgres_baseline"
        draft_dir.mkdir(parents=True)
        (migrations / "migration_lock.toml").write_text(
            'provider = "postgresql"\n', encoding="utf-8"
        )
        (draft_dir / "migration.sql").write_text("-- baseline\n", encoding="utf-8")
        (package_root / "README.md").write_text("# Draft\n", encoding="utf-8")
        return ["PostgreSQL baseline package", "PASS ready"], 0

    import scripts.postgres_live_baseline_candidate as candidate

    original = candidate.baseline_package.build_baseline_package
    candidate.baseline_package.build_baseline_package = fake_build_baseline_package
    try:
        messages, exit_code = scaffold_live_baseline_candidate(
            candidate_root=candidate_root,
            package_root=package_root,
            legacy_migrations_root=legacy_root,
        )
    finally:
        candidate.baseline_package.build_baseline_package = original

    assert exit_code == 0
    assert (candidate_root / "migrations" / "migration_lock.toml").exists()
    assert (
        candidate_root
        / "migrations"
        / "00000000000000_postgres_baseline"
        / "migration.sql"
    ).exists()
    assert (candidate_root / "sqlite-history-manifest.json").exists()
    assert any("legacy SQLite migration" in message for message in messages)
