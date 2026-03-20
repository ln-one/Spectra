from datetime import datetime

import scripts.postgres_recovery_drill as recovery_drill


def test_recovery_drill_fails_when_prerequisites_missing():
    messages, failures = recovery_drill.evaluate_recovery_drill(
        {"DATABASE_URL": "file:./dev.db"}
    )

    assert failures > 0
    assert messages[0] == "PostgreSQL recovery drill"
    assert any(
        "[drill] FAIL backup/restore prerequisites" in message for message in messages
    )


def test_recovery_drill_builds_backup_and_restore_commands(monkeypatch):
    monkeypatch.setattr(
        recovery_drill,
        "evaluate_postgres_toolchain",
        lambda env: (
            [
                "PostgreSQL toolchain readiness audit",
                "PASS PG_DUMP_BIN resolved via `pg_dump` (/usr/bin/pg_dump)",
                "PASS PostgreSQL CLI toolchain available for backup/restore",
            ],
            0,
        ),
    )

    messages, failures = recovery_drill.evaluate_recovery_drill(
        {
            "DATABASE_URL": "postgresql://spectra:pass@db.internal:5432/spectra",
            "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
            "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
            "POSTGRES_BACKUP_RETENTION_DAYS": "14",
            "POSTGRES_BACKUP_PREFIX": "spectra-demo",
            "PG_DUMP_BIN": "pg_dump",
            "PG_RESTORE_BIN": "pg_restore",
            "PSQL_BIN": "psql",
        },
        now=datetime(2026, 3, 20, 15, 45, 30),
    )

    assert failures == 0
    assert any(
        (
            "[drill] PASS backup artifact would be created at "
            "`/var/lib/spectra/backups/spectra-demo-20260320-154530.dump`"
        )
        in message
        for message in messages
    )
    assert any("pg_dump" in message for message in messages)
    assert any("pg_restore" in message for message in messages)
    assert any("restore-staging" in message for message in messages)
