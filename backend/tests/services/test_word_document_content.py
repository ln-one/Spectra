from __future__ import annotations

from services.generation_session_service.word_document_content import (
    document_content_to_markdown,
    markdown_to_document_content,
)


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


def test_markdown_to_document_content_preserves_deeper_heading_levels():
    markdown = (
        "# 主标题\n\n"
        "## 第二层\n\n"
        "### 第三层\n\n"
        "#### 第四层\n\n"
        "##### 第五层\n\n"
        "###### 第六层\n"
    )

    document = markdown_to_document_content(markdown)
    content = document.get("content", [])
    heading_levels = [
        node.get("attrs", {}).get("level")
        for node in content
        if isinstance(node, dict) and node.get("type") == "heading"
    ]

    assert heading_levels == [1, 2, 3, 4, 5, 6]
    assert document_content_to_markdown(document) == markdown.strip()
