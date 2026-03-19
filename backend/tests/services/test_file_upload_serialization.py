from services.file_upload_service.serialization import derive_parse_progress


def test_derive_parse_progress_uses_formal_upload_status_mapping():
    assert derive_parse_progress("uploading") == 0
    assert derive_parse_progress("parsing") == 50
    assert derive_parse_progress("ready") == 100
    assert derive_parse_progress("failed") == 100
    assert derive_parse_progress("unknown") is None
