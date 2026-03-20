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
