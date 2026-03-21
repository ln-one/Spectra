from scripts.deployment_env_role_audit import evaluate_role_contract


def test_backend_role_fails_when_required_values_missing():
    messages, failures = evaluate_role_contract("backend", {})

    assert failures == 2
    assert messages[0] == "Deployment env role audit: backend"
    assert any("FAIL required DATABASE_URL missing" in message for message in messages)
    assert any(
        "FAIL required JWT_SECRET_KEY missing" in message for message in messages
    )


def test_backend_role_warns_for_recommended_values_only():
    messages, failures = evaluate_role_contract(
        "backend",
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
            "UPLOAD_DIR": "/var/lib/spectra/uploads",
            "ARTIFACT_STORAGE_DIR": "/var/lib/spectra/artifacts",
            "GENERATED_DIR": "/var/lib/spectra/generated",
            "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
            "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
            "POSTGRES_BACKUP_RETENTION_DAYS": "14",
            "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        },
    )

    assert failures == 0
    assert any(
        "PASS required DATABASE_URL configured" in message for message in messages
    )
    assert any(
        "WARN recommended DEFAULT_MODEL missing" in message for message in messages
    )
    assert any(
        "WARN recommended PREVIEW_REBUILD_TIMEOUT_SECONDS missing" in message
        for message in messages
    )
    assert any(
        "PASS recommended UPLOAD_DIR configured" in message for message in messages
    )
    assert any(
        "PASS recommended POSTGRES_BACKUP_DIR configured" in message
        for message in messages
    )


def test_worker_role_tracks_worker_specific_recommendations():
    messages, failures = evaluate_role_contract(
        "worker",
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
            "WORKER_NAME": "worker-a",
            "WORKER_RECOVERY_SCAN": "true",
            "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
            "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
            "POSTGRES_BACKUP_RETENTION_DAYS": "14",
            "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        },
    )

    assert failures == 0
    assert any(
        "PASS recommended WORKER_NAME configured" in message for message in messages
    )
    assert any(
        "PASS recommended WORKER_RECOVERY_SCAN configured" in message
        for message in messages
    )
