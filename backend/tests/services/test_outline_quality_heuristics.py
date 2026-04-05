import importlib.util
from pathlib import Path

from schemas.outline import CoursewareOutline, OutlineSection

_MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "services"
    / "courseware_ai"
    / "outline_support.py"
)
_SPEC = importlib.util.spec_from_file_location("outline_support_module", _MODULE_PATH)
assert _SPEC is not None and _SPEC.loader is not None
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)

inject_focus_anchors = _MODULE.inject_focus_anchors
reduce_outline_repetition = _MODULE.reduce_outline_repetition


def test_reduce_outline_repetition_renames_duplicate_titles():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="核心知识点",
                key_points=["牛顿第二定律", "受力分析", "加速度变化"],
                slide_count=2,
            ),
            OutlineSection(
                title="核心知识点",
                key_points=["受力分析", "实验观察", "课堂练习"],
                slide_count=2,
            ),
        ],
    )

    reduced = reduce_outline_repetition(outline)
    titles = [section.title for section in reduced.sections]

    assert len(set(titles)) == 2
    assert titles[0] == "核心知识点"
    assert titles[1].startswith("核心知识点：")
    assert "实验观察" in titles[1] or "课堂练习" in titles[1]


def test_reduce_outline_repetition_removes_cross_section_duplicate_points():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(
                title="导入与目标",
                key_points=["学习目标", "牛顿第二定律", "课堂提问"],
                slide_count=2,
            ),
            OutlineSection(
                title="核心概念",
                key_points=["牛顿第二定律", "课堂提问", "受力分析"],
                slide_count=2,
            ),
        ],
    )

    reduced = reduce_outline_repetition(outline)

    assert reduced.sections[0].key_points == ["学习目标", "牛顿第二定律", "课堂提问"]
    assert "牛顿第二定律" not in reduced.sections[1].key_points
    assert "课堂提问" not in reduced.sections[1].key_points
    assert "受力分析" in reduced.sections[1].key_points


def test_inject_focus_anchors_uses_section_specific_interaction_and_focus_anchor():
    outline = CoursewareOutline(
        title="测试课程",
        sections=[
            OutlineSection(title="导入与目标", key_points=["学习目标"], slide_count=2),
            OutlineSection(title="核心概念", key_points=["关键概念"], slide_count=2),
        ],
    )

    enriched = inject_focus_anchors(outline)
    first_points = enriched.sections[0].key_points
    second_points = enriched.sections[1].key_points

    assert "导入与目标互动提问" in first_points
    assert "知识地图" in first_points
    assert "核心概念互动提问" in second_points
    assert "关键例题" in second_points
