from fastapi.testclient import TestClient

from main import app
from services.system_settings_service import system_settings_service
from utils.dependencies import get_current_user


def _client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: "u-001"
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.pop(get_current_user, None)
    system_settings_service.reset_for_tests()


def test_get_system_settings_reads_defaults(monkeypatch):
    monkeypatch.setenv("DEFAULT_MODEL", "qwen3.5-plus")
    monkeypatch.setenv("LARGE_MODEL", "qwen-max")
    monkeypatch.setenv("SMALL_MODEL", "qwen-turbo")
    monkeypatch.setenv("CHAT_RESPONSE_TIMEOUT_SECONDS", "95")
    monkeypatch.setenv("AI_REQUEST_TIMEOUT_SECONDS", "70")

    client = _client()
    response = client.get("/api/v1/system-settings")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["models"]["default_model"] == "qwen3.5-plus"
    assert payload["models"]["large_model"] == "qwen-max"
    assert payload["models"]["small_model"] == "qwen-turbo"
    assert payload["experience"]["chat_timeout_seconds"] == 95
    assert payload["experience"]["ai_request_timeout_seconds"] == 70


def test_patch_system_settings_updates_runtime_overlay():
    client = _client()

    response = client.patch(
        "/api/v1/system-settings",
        json={
            "models": {"default_model": "qwen3.5-flash"},
            "generation_defaults": {"default_page_count": 16},
            "feature_flags": {"enable_file_upload": False},
        },
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["models"]["default_model"] == "qwen3.5-flash"
    assert payload["generation_defaults"]["default_page_count"] == 16
    assert payload["feature_flags"]["enable_file_upload"] is False

    follow_up = client.get("/api/v1/system-settings")
    follow_up_payload = follow_up.json()["data"]
    assert follow_up_payload["models"]["default_model"] == "qwen3.5-flash"
    assert follow_up_payload["generation_defaults"]["default_page_count"] == 16
    assert follow_up_payload["feature_flags"]["enable_file_upload"] is False


def test_patch_system_settings_merges_partial_sections():
    client = _client()

    first = client.patch(
        "/api/v1/system-settings",
        json={
            "models": {
                "default_model": "model-a",
                "small_model": "model-b",
            }
        },
    )
    assert first.status_code == 200

    second = client.patch(
        "/api/v1/system-settings",
        json={"models": {"large_model": "model-c"}},
    )
    assert second.status_code == 200

    payload = second.json()["data"]
    assert payload["models"]["default_model"] == "model-a"
    assert payload["models"]["small_model"] == "model-b"
    assert payload["models"]["large_model"] == "model-c"
