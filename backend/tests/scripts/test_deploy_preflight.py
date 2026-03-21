from scripts.deploy_preflight import evaluate_preflight


def test_preflight_flags_missing_required_values_when_network_skipped():
    messages, failures = evaluate_preflight(
        {},
        skip_network=True,
        timeout_seconds=0.1,
    )

    assert failures == 2
    assert messages[0] == "Deployment preflight"
    assert any("FAIL DATABASE_URL missing" in message for message in messages)
    assert any("FAIL JWT_SECRET_KEY missing" in message for message in messages)


def test_preflight_rejects_placeholder_jwt_secret():
    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "change-me",
        },
        skip_network=True,
        timeout_seconds=0.1,
    )

    assert failures == 1
    assert any("placeholder development secret" in message for message in messages)


def test_preflight_warns_when_still_using_sqlite_for_local_dev():
    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "file:./dev.db",
            "JWT_SECRET_KEY": "real-secret",
        },
        skip_network=True,
        timeout_seconds=0.1,
    )

    assert failures == 0
    assert any("still points to sqlite" in message for message in messages)


def test_preflight_require_postgres_rejects_sqlite_and_local_host():
    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "postgresql://spectra:pass@localhost:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
        },
        skip_network=True,
        timeout_seconds=0.1,
        require_postgres=True,
    )

    assert failures == 1
    assert any("uses PostgreSQL-compatible scheme" in message for message in messages)
    assert any(
        "local-only while --require-postgres is enabled" in message
        for message in messages
    )


def test_preflight_can_allow_local_postgres_host_for_shadow_rehearsal():
    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "postgresql://spectra:pass@127.0.0.1:5432/spectra_shadow",
            "JWT_SECRET_KEY": "real-secret",
        },
        skip_network=True,
        timeout_seconds=0.1,
        require_postgres=True,
        allow_local_host=True,
    )

    assert failures == 0
    assert any("uses PostgreSQL-compatible scheme" in message for message in messages)
    assert any("allowed for shadow rehearsal" in message for message in messages)


def test_preflight_require_postgres_rejects_non_postgres_scheme():
    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "file:./dev.db",
            "JWT_SECRET_KEY": "real-secret",
        },
        skip_network=True,
        timeout_seconds=0.1,
        require_postgres=True,
    )

    assert failures == 1
    assert any("not using PostgreSQL" in message for message in messages)


def test_preflight_checks_network_targets_when_configured():
    calls: list[tuple[str, int, float]] = []

    def fake_tcp_check(host: str, port: int, timeout_seconds: float):
        calls.append((host, port, timeout_seconds))
        return True, f"PASS tcp {host}:{port} reachable"

    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
            "REDIS_HOST": "redis.internal",
            "REDIS_PORT": "6379",
            "CHROMA_HOST": "chroma.internal",
            "CHROMA_PORT": "8000",
        },
        skip_network=False,
        timeout_seconds=0.5,
        tcp_check=fake_tcp_check,
    )

    assert failures == 0
    assert calls == [
        ("postgres.internal", 5432, 0.5),
        ("redis.internal", 6379, 0.5),
        ("chroma.internal", 8000, 0.5),
    ]
    assert any(
        "PASS tcp postgres.internal:5432 reachable" in message for message in messages
    )


def test_preflight_reports_render_toolchain_availability(monkeypatch):
    def fake_which(binary: str):
        if binary == "marp":
            return "/usr/local/bin/marp"
        return None

    monkeypatch.setattr("scripts.deploy_preflight.shutil.which", fake_which)

    messages, failures = evaluate_preflight(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
        },
        skip_network=True,
        timeout_seconds=0.1,
    )

    assert failures == 0
    assert any("PASS marp available at /usr/local/bin/marp" in m for m in messages)
    assert any("WARN pandoc missing" in m for m in messages)
