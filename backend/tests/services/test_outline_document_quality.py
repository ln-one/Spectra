from schemas.outline import CoursewareOutline, OutlineSection
from services.generation_session_service.outline_helpers import (
    _courseware_outline_to_document,
)


def test_outline_document_padding_has_meaningful_key_points():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="核心知识点",
                key_points=["概念定义", "性质分析"],
                slide_count=2,
            )
        ],
    )

    document = _courseware_outline_to_document(outline, target_pages=6)
    nodes = document["nodes"]

    assert len(nodes) == 6
    for node in nodes:
        assert len(node["key_points"]) >= 3
        assert all(str(point).strip() for point in node["key_points"])


def test_outline_document_split_titles_are_not_repetitive_indexes():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="核心知识点",
                key_points=["概念定义", "例题拆解", "误区辨析"],
                slide_count=3,
            )
        ],
    )

    document = _courseware_outline_to_document(outline, target_pages=3)
    titles = [node["title"] for node in document["nodes"]]

    assert len(set(titles)) == 3
    assert titles == [
        "核心知识点（1/3）",
        "核心知识点（2/3）",
        "核心知识点（3/3）",
    ]
    assert all("·" not in title for title in titles)


def test_outline_document_split_key_points_include_focus_anchors():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="核心知识点",
                key_points=["概念定义", "例题拆解", "误区辨析"],
                slide_count=5,
            )
        ],
    )

    document = _courseware_outline_to_document(outline, target_pages=5)
    merged_points = " ".join(
        point for node in document["nodes"] for point in node["key_points"]
    )

    assert "知识地图" in merged_points
    assert "关键例题" in merged_points
    assert "易错点澄清" in merged_points


def test_outline_document_respects_target_pages_when_need_truncate():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="导入",
                key_points=["目标", "提问", "板书"],
                slide_count=3,
            ),
            OutlineSection(
                title="核心",
                key_points=["知识地图", "关键例题", "易错点澄清"],
                slide_count=3,
            ),
        ],
    )

    document = _courseware_outline_to_document(outline, target_pages=4)
    nodes = document["nodes"]

    assert len(nodes) == 4
    assert [node["order"] for node in nodes] == [1, 2, 3, 4]
