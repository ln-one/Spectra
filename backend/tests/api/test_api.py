def test_health_check(client):
    response = client.get("/")
    assert response.status_code == 200


def test_api_docs_accessible(client):
    response = client.get("/docs")
    assert response.status_code == 200


def test_openapi_schema(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "info" in data


def test_capabilities_health_endpoint(client):
    response = client.get("/api/v1/health/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "document_parser" in body["data"]
    assert "video_understanding" in body["data"]
    assert "speech_recognition" in body["data"]
    assert "animation_rendering" in body["data"]
