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
