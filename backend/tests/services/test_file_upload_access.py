from services.file_upload_service import (
    FileType,
    normalize_file_type,
    resolve_file_type,
)


def test_normalize_file_type_maps_legacy_document_aliases():
    assert normalize_file_type("docx") == FileType.WORD
    assert normalize_file_type("text") == FileType.WORD
    assert normalize_file_type("presentation") == FileType.PPT


def test_resolve_file_type_prefers_mime_vocabulary():
    assert resolve_file_type("slides.unknown", "application/vnd.ms-powerpoint") == "ppt"
    assert resolve_file_type("notes.unknown", "text/plain") == "word"
    assert resolve_file_type("clip.unknown", "video/mp4") == "video"
    assert resolve_file_type("image.unknown", "image/png") == "image"


def test_resolve_file_type_uses_extension_vocabulary():
    assert resolve_file_type("notes.md") == "word"
    assert resolve_file_type("deck.pptx") == "ppt"
    assert resolve_file_type("frame.webp") == "image"
    assert resolve_file_type("unknown.bin") == "pdf"
