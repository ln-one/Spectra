import types

from schemas.common import (
    SourceType,
    build_source_reference_payload,
    extract_source_reference_payload,
)


def test_build_source_reference_payload_normalizes_legacy_types():
    payload = build_source_reference_payload(
        chunk_id="chunk-1",
        source_type="webpage",
        filename="example.html",
        timestamp=12.5,
        score=0.88,
        content_preview="preview",
    )

    assert payload == {
        "chunk_id": "chunk-1",
        "source_type": SourceType.WEB.value,
        "filename": "example.html",
        "timestamp": 12.5,
        "score": 0.88,
        "content_preview": "preview",
    }


def test_extract_source_reference_payload_accepts_objects_and_preview_text():
    source = types.SimpleNamespace(
        chunk_id="chunk-2",
        source_type="pdf",
        filename="lesson.pdf",
        page_number=7,
        preview_text="section preview",
    )

    payload = extract_source_reference_payload(source)

    assert payload == {
        "chunk_id": "chunk-2",
        "source_type": SourceType.DOCUMENT.value,
        "filename": "lesson.pdf",
        "page_number": 7,
        "content_preview": "section preview",
    }
