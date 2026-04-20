from __future__ import annotations

from services.generation_session_service.word_document_content import markdown_to_document_content


def test_markdown_to_document_content_handles_compact_markdown_without_double_blank_lines():
    markdown = (
        "# 计算机网络：物理层教案\n"
        "## 教学定位\n"
        "教学情境：案例导入\n"
        "## 分层目标\n"
        "- 目标一\n"
        "- 目标二\n"
        "## 教学流程\n"
        "1. 导入\n"
        "2. 讲解\n"
    )
    document = markdown_to_document_content(markdown)
    node_types = [node.get("type") for node in document.get("content", [])]
    assert "heading" in node_types
    assert "paragraph" in node_types
    assert "bulletList" in node_types
    assert "orderedList" in node_types
