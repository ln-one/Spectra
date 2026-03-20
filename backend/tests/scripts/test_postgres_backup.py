from datetime import datetime
from pathlib import Path

from scripts.postgres_backup import (
    build_backup_command,
    build_backup_path,
    execute_backup,
)


def test_build_backup_path_uses_prefix_and_timestamp():
    path = build_backup_path(
        {
            "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
            "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        },
        now=datetime(2026, 3, 20, 12, 34, 56),
    )

    assert path == Path("/var/lib/spectra/backups/spectra-demo-20260320-123456.dump")


def test_build_backup_command_uses_pg_dump_by_default():
    command = build_backup_command(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "PG_DUMP_BIN": "pg_dump-custom",
        },
        output_path=Path("/var/lib/spectra/backups/spectra-demo.dump"),
    )

    assert command[0] == "pg_dump-custom"
    assert "--format=custom" in command
    assert "--file" in command


def test_build_backup_command_supports_docker_fallback():
    command = build_backup_command(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "POSTGRES_BACKUP_USE_DOCKER": "true",
        },
        output_path=Path("/var/lib/spectra/backups/spectra-demo.dump"),
    )

    assert command[:3] == ["docker", "run", "--rm"]
    assert "pg_dump" in command
    assert "postgres:16-alpine" in command


def test_execute_backup_creates_directory_and_runs_command(tmp_path: Path):
    ran = []
    output_path, command, code = execute_backup(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "POSTGRES_BACKUP_DIR": str(tmp_path / "backups"),
        },
        now=datetime(2026, 3, 20, 1, 2, 3),
        run_command=lambda cmd: ran.append(list(cmd)) or 0,
    )

    assert code == 0
    assert output_path.parent.exists()
    assert ran == [command]
