from services.platform.dualweave_execution import (
    build_dualweave_execution,
    dualweave_remote_parse_supported,
)


def test_dualweave_execution_builds_document_template(monkeypatch):
    monkeypatch.delenv("DUALWEAVE_DOCUMENT_WORKFLOW_URL", raising=False)
    monkeypatch.setenv("DUALWEAVE_DOCUMENT_BASE_URL", "https://mineru.example")
    monkeypatch.setenv("DUALWEAVE_DOCUMENT_TOKEN_ENV", "MINERU_TOKEN")

    execution = build_dualweave_execution("pdf")

    assert execution is not None
    assert execution["local"]["kind"] == "localfs"
    assert execution["custom"]["kind"] == "brokered_http_upload"
    custom_config = execution["custom"]["config"]
    assert (
        custom_config["prepare"]["url"]
        == "https://mineru.example/api/v4/file-urls/batch"
    )
    assert (
        custom_config["workflow"]["url"]
        == "https://mineru.example/api/v4/extract-results/batch/{job_id}"
    )
    assert custom_config["auth"]["kind"] == "auth/header_token"
    assert custom_config["auth"]["config"]["token_env"] == "MINERU_TOKEN"
    assert execution["workflow_options"]["poll_interval"] == "3s"


def test_dualweave_execution_builds_image_template(monkeypatch):
    monkeypatch.setenv("DUALWEAVE_IMAGE_BASE_URL", "https://ocr.example")
    monkeypatch.setenv("DUALWEAVE_IMAGE_API_KEY_ENV", "OCR_TOKEN")

    execution = build_dualweave_execution("image")

    assert execution is not None
    assert execution["local"]["kind"] == "localfs"
    assert execution["send"]["kind"] == "send/http_multipart"
    assert execution["send"]["config"]["url"] == "https://ocr.example"
    assert execution["workflow"]["kind"] == "workflow/immediate"
    assert execution["result"]["kind"] == "result/inline_json"
    assert execution["auth"]["kind"] == "auth/header_token"
    assert execution["auth"]["config"]["token_env"] == "OCR_TOKEN"
    assert execution["policy"]["routing"]["small_file_threshold_bytes"] > 0


def test_dualweave_execution_returns_none_for_unsupported_type():
    assert dualweave_remote_parse_supported("video") is False
    assert build_dualweave_execution("video") is None
