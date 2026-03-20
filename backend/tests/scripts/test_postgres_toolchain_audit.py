from scripts.postgres_toolchain_audit import evaluate_postgres_toolchain


def test_toolchain_audit_fails_without_cli_or_docker_fallback():
    messages, failures = evaluate_postgres_toolchain(
        {},
        which=lambda binary: None,
    )

    assert failures == 1
    assert messages[0] == "PostgreSQL toolchain readiness audit"
    assert any(
        "PostgreSQL CLI tools missing for cutover" in message for message in messages
    )


def test_toolchain_audit_accepts_cli_tools_when_present():
    messages, failures = evaluate_postgres_toolchain(
        {},
        which=lambda binary: f"/usr/bin/{binary}",
    )

    assert failures == 0
    assert any("PG_DUMP_BIN resolved" in message for message in messages)
    assert any(
        "PostgreSQL CLI toolchain available for backup/restore" in message
        for message in messages
    )


def test_toolchain_audit_accepts_docker_fallback_when_enabled():
    binaries = {"docker": "/usr/bin/docker"}
    messages, failures = evaluate_postgres_toolchain(
        {"POSTGRES_BACKUP_USE_DOCKER": "true"},
        which=lambda binary: binaries.get(binary),
    )

    assert failures == 0
    assert any(
        "Docker backup/restore fallback available" in message for message in messages
    )
    assert any(
        "PostgreSQL CLI tools missing locally, but Docker fallback is enabled"
        in message
        for message in messages
    )
