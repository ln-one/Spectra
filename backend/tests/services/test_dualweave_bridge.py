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
        "result_source": "service_replay",
        "remote_retryable": False,
        "remote_next_action": "none",
        "sender_attempts": 1,
        "replay_status": "succeeded",
        "execution_snapshot": {
            "send": {"kind": "send/http_multipart"},
            "workflow": {"kind": "workflow/immediate"},
            "result": {"kind": "result/inline_json"},
        },
        "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        "delivery_artifact": {"provider": "mineru"},
    }

    payload = build_dualweave_parse_result(result)

    assert payload["deferred_parse"] is True
    assert payload["parse_mode"] == "dualweave_remote"
    assert payload["dualweave"]["upload_id"] == "upl-123"
    assert payload["dualweave"]["result_source"] == "service_replay"
    assert payload["dualweave"]["replay_status"] == "succeeded"
    assert (
        payload["dualweave"]["execution_snapshot"]["send"]["kind"]
        == "send/http_multipart"
    )
    assert payload["dualweave"]["execution_digest"]
    assert payload["result_url"] == "https://example.invalid/result.zip"
    assert payload["delivery_artifact"]["provider"] == "mineru"
    assert payload["provider_used"] == "mineru"


def test_extract_dualweave_result_url_returns_none_when_missing():
    assert extract_dualweave_result_url({}) is None
