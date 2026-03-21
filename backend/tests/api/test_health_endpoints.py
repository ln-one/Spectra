import main


def test_liveness_endpoint(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_endpoint_returns_dependency_latency(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    payload = response.json()
    assert "dependency_timeout_seconds" in payload
    assert "latency_ms" in payload
    assert "database" in payload["latency_ms"]
    assert "redis" in payload["latency_ms"]


def test_health_returns_503_when_required_dependency_unhealthy(client, monkeypatch):
    async def _db_fail(_timeout):
        return False, 10.0

    async def _redis_ok(_timeout):
        return True, 2.0

    monkeypatch.setenv("DB_REQUIRED", "true")
    monkeypatch.setenv("REDIS_REQUIRED", "false")
    monkeypatch.setenv("HEALTH_DEPENDENCY_TIMEOUT_SECONDS", "0.01")
    monkeypatch.setattr(main, "_probe_database", _db_fail)
    monkeypatch.setattr(main, "_probe_redis", _redis_ok)

    response = client.get("/health")
    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["error"]["retryable"] is True
    assert body["error"]["details"]["health"]["status"] == "degraded"
