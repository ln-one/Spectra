import main


def test_liveness_endpoint(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_endpoint_returns_dependency_latency(client, monkeypatch):
    async def _db_ok(_timeout):
        return True, 5.0

    async def _redis_ok(_timeout):
        return True, 2.0

    monkeypatch.setenv("DB_REQUIRED", "false")
    monkeypatch.setenv("REDIS_REQUIRED", "false")
    monkeypatch.setenv("SERVICE_AUTHORITIES_REQUIRED", "false")
    monkeypatch.setattr(main, "_probe_database", _db_ok)
    monkeypatch.setattr(main, "_probe_redis", _redis_ok)

    response = client.get("/health/ready")
    assert response.status_code == 200
    payload = response.json()
    assert "dependency_timeout_seconds" in payload
    assert "service_authority_timeout_seconds" in payload
    assert "service_authorities" in payload
    assert "diego" in payload["service_authorities"]["services"]
    assert "pagevra" in payload["service_authorities"]["services"]
    assert "ourograph" in payload["service_authorities"]["services"]
    assert "dualweave" in payload["service_authorities"]["services"]
    assert "stratumind" in payload["service_authorities"]["services"]
    assert "limora" in payload["service_authorities"]["services"]
    assert "latency_ms" in payload
    assert "database" in payload["latency_ms"]
    assert "redis" in payload["latency_ms"]
    assert "service_authorities" in payload["latency_ms"]


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


def test_health_returns_503_when_required_service_authorities_unhealthy(
    client, monkeypatch
):
    async def _db_ok(_timeout):
        return True, 5.0

    async def _redis_ok(_timeout):
        return True, 2.0

    async def _services_fail(_timeout):
        return {
            "required": True,
            "healthy": False,
            "services": {"diego": {"configured": False}},
            "timed_out": False,
        }, 3.0

    monkeypatch.setenv("DB_REQUIRED", "false")
    monkeypatch.setenv("REDIS_REQUIRED", "false")
    monkeypatch.setenv("SERVICE_AUTHORITIES_REQUIRED", "true")
    monkeypatch.setattr(main, "_probe_database", _db_ok)
    monkeypatch.setattr(main, "_probe_redis", _redis_ok)
    monkeypatch.setattr(main, "_probe_service_authorities", _services_fail)

    response = client.get("/health")
    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["error"]["details"]["health"]["service_authorities"]["required"] is True
    assert body["error"]["details"]["health"]["service_authorities"]["healthy"] is False
