from scripts.postgres_backup_restore_audit import evaluate_backup_restore_readiness


def test_backup_restore_audit_fails_for_sqlite_and_missing_paths():
    messages, failures = evaluate_backup_restore_readiness(
        {
            "DATABASE_URL": "file:./dev.db",
            "POSTGRES_BACKUP_DIR": "./backup",
        }
    )

    assert failures > 0
    assert messages[0] == "PostgreSQL backup/restore readiness audit"
    assert any("still points to sqlite" in message for message in messages)
    assert any(
        "POSTGRES_BACKUP_DIR must point to an absolute shared path" in message
        for message in messages
    )
    assert any(
        "POSTGRES_RESTORE_STAGING_DIR missing" in message for message in messages
    )


def test_backup_restore_audit_passes_with_shared_paths_and_retention():
    messages, failures = evaluate_backup_restore_readiness(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
            "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
            "POSTGRES_BACKUP_RETENTION_DAYS": "14",
            "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        }
    )

    assert failures == 0
    assert any("uses PostgreSQL-compatible scheme" in message for message in messages)
    assert any("points to shared backup path" in message for message in messages)
    assert any("restore staging path" in message for message in messages)
    assert any("RETENTION_DAYS set to 14" in message for message in messages)
