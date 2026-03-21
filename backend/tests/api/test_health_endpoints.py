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
    assert "tool_timeout_seconds" in payload
    assert "generation_tools" in payload
    assert "marp" in payload["generation_tools"]
    assert "pandoc" in payload["generation_tools"]
    assert "latency_ms" in payload
    assert "database" in payload["latency_ms"]
    assert "redis" in payload["latency_ms"]
    assert "generation_tools" in payload["latency_ms"]


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


def test_health_returns_503_when_required_generation_tools_unhealthy(
    client, monkeypatch
):
    async def _db_ok(_timeout):
        return True, 5.0

    async def _redis_ok(_timeout):
        return True, 2.0

    async def _tools_fail(_timeout):
        return {
            "marp": "unavailable",
            "pandoc": "unavailable",
            "healthy": False,
            "timed_out": False,
        }, 3.0

    monkeypatch.setenv("DB_REQUIRED", "false")
    monkeypatch.setenv("REDIS_REQUIRED", "false")
    monkeypatch.setenv("GENERATION_TOOLS_REQUIRED", "true")
    monkeypatch.setattr(main, "_probe_database", _db_ok)
    monkeypatch.setattr(main, "_probe_redis", _redis_ok)
    monkeypatch.setattr(main, "_probe_generation_tools", _tools_fail)

    response = client.get("/health")
    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["error"]["details"]["health"]["generation_tools"]["required"] is True
    assert body["error"]["details"]["health"]["generation_tools"]["healthy"] is False
