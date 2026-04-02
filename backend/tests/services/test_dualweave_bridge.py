from services.file_upload_service.dualweave_bridge import (
    build_dualweave_parse_result,
    extract_dualweave_result_url,
)


def test_build_dualweave_parse_result_normalizes_core_fields():
    result = {
        "upload_id": "upl-123",
        "status": "completed",
        "stage": "completed",
        "delivery_status": "delivered",
        "processing_status": "succeeded",
        "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        "delivery_artifact": {"provider": "mineru"},
    }

    payload = build_dualweave_parse_result(result)

    assert payload["deferred_parse"] is True
    assert payload["parse_mode"] == "dualweave_service"
    assert payload["dualweave"]["upload_id"] == "upl-123"
    assert payload["result_url"] == "https://example.invalid/result.zip"
    assert payload["delivery_artifact"]["provider"] == "mineru"


def test_extract_dualweave_result_url_returns_none_when_missing():
    assert extract_dualweave_result_url({}) is None
