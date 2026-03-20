from pathlib import Path

from scripts.postgres_restore import (
    build_restore_command,
    execute_restore,
    stage_restore_input,
)


def test_stage_restore_input_uses_shared_staging_dir():
    staged = stage_restore_input(
        Path("/var/lib/spectra/backups/demo.dump"),
        {"POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging"},
    )

    assert staged == Path("/var/lib/spectra/restore-staging/demo.dump")


def test_build_restore_command_uses_pg_restore_for_dump():
    command = build_restore_command(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "PG_RESTORE_BIN": "pg_restore-custom",
        },
        backup_path=Path("/var/lib/spectra/backups/demo.dump"),
    )

    assert command[0] == "pg_restore-custom"
    assert "--dbname" in command
    assert "--clean" in command


def test_build_restore_command_uses_psql_for_sql_backups():
    command = build_restore_command(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "PSQL_BIN": "psql-custom",
        },
        backup_path=Path("/var/lib/spectra/backups/demo.sql"),
    )

    assert command[:3] == [
        "psql-custom",
        "postgresql://spectra:pass@db.internal:5432/spectra",
        "-f",
    ]


def test_execute_restore_requires_existing_file(tmp_path: Path):
    backup = tmp_path / "demo.dump"
    backup.write_text("placeholder", encoding="utf-8")
    ran = []
    command, code = execute_restore(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
        },
        backup_path=backup,
        run_command=lambda cmd: ran.append(list(cmd)) or 0,
    )

    assert code == 0
    assert ran == [command]
