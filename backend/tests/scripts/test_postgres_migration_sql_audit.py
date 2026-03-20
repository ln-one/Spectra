from scripts.postgres_migration_sql_audit import evaluate_migration_sql


def test_migration_sql_audit_detects_sqlite_markers():
    messages, failures = evaluate_migration_sql()

    assert failures == 0
    assert messages[0] == "PostgreSQL migration SQL audit"
    assert any("SQLite PRAGMA statements" in message for message in messages)
    assert any(
        "prepare a PostgreSQL baseline migration path before cutover" in message
        for message in messages
    )
