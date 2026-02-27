from pathlib import Path

from services.file_parser import extract_text_for_rag


def test_extract_text_for_rag_txt_file(tmp_path: Path):
    file_path = tmp_path / "notes.txt"
    file_path.write_text("第一行内容\n第二行内容", encoding="utf-8")

    text, details = extract_text_for_rag(str(file_path), "notes.txt", "other")

    assert "第一行内容" in text
    assert details["text_length"] > 0


def test_extract_text_for_rag_image_placeholder(tmp_path: Path):
    file_path = tmp_path / "figure.png"
    file_path.write_bytes(b"\x89PNG\r\n")

    text, details = extract_text_for_rag(str(file_path), "figure.png", "image")

    assert "图片资料" in text
    assert "figure.png" in text
    assert details["images_extracted"] == 1
