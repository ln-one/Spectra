from scripts.postgres_baseline_package import build_baseline_package


def test_build_baseline_package_writes_lock_and_migration(tmp_path):
    def fake_diff(env, *, schema_output, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("-- postgres baseline\n", encoding="utf-8")
        return ["PostgreSQL baseline diff", "PASS diff ready"], 0

    messages, exit_code = build_baseline_package(
        {},
        package_root=tmp_path / "package",
        migration_tag="20260320_postgres_baseline",
        run_diff=fake_diff,
    )

    assert exit_code == 0
    lock_file = tmp_path / "package" / "migrations" / "migration_lock.toml"
    migration_sql = (
        tmp_path
        / "package"
        / "migrations"
        / "20260320_postgres_baseline"
        / "migration.sql"
    )
    assert 'provider = "postgresql"' in lock_file.read_text(encoding="utf-8")
    assert migration_sql.read_text(encoding="utf-8") == "-- postgres baseline\n"
    assert any("draft baseline migration" in message for message in messages)


def test_build_baseline_package_propagates_diff_failure(tmp_path):
    def fake_diff(env, *, schema_output, output_path):
        return ["PostgreSQL baseline diff", "FAIL diff failed"], 2

    messages, exit_code = build_baseline_package(
        {},
        package_root=tmp_path / "package",
        run_diff=fake_diff,
    )

    assert exit_code == 2
    assert any("[diff] FAIL diff failed" in message for message in messages)
