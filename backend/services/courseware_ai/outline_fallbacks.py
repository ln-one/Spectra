from schemas.outline import CoursewareOutline, OutlineSection

from .outline_support import (
    align_slide_count_with_target,
    extract_target_pages,
    inject_focus_anchors,
)


def build_deterministic_outline(
    user_requirements: str,
    target_pages: int | None,
) -> CoursewareOutline:
    pages = target_pages or 12
    sections = [
        OutlineSection(
            title="导入与目标",
            key_points=["学习目标", "情境导入", "课堂互动提问", "板书逻辑预告"],
            slide_count=2,
        ),
        OutlineSection(
            title="知识地图构建",
            key_points=["知识地图", "概念关系梳理", "核心原理拆解", "板书主线搭建"],
            slide_count=2,
        ),
        OutlineSection(
            title="关键例题精讲",
            key_points=["关键例题", "解题步骤可视化", "变式题训练", "课堂追问"],
            slide_count=3,
        ),
        OutlineSection(
            title="易错点澄清",
            key_points=["易错点澄清", "反例辨析", "纠错策略", "板书归纳"],
            slide_count=2,
        ),
        OutlineSection(
            title="互动练习与总结",
            key_points=["分层练习", "互动问答", "课堂小结", "作业延伸"],
            slide_count=2,
        ),
    ]
    outline = CoursewareOutline(
        title=user_requirements[:50] or "课堂教学大纲",
        sections=sections,
        total_slides=sum(section.slide_count for section in sections),
        summary="已按课堂可执行结构生成知识地图+例题+易错点闭环大纲",
    )
    return align_slide_count_with_target(outline, pages)


def get_fallback_outline(user_requirements: str) -> CoursewareOutline:
    target_pages = extract_target_pages(user_requirements)
    normalized_requirements = str(user_requirements or "").strip() or "课堂教学大纲"
    fallback = build_deterministic_outline(
        user_requirements=normalized_requirements,
        target_pages=target_pages,
    )
    fallback = inject_focus_anchors(fallback)
    fallback = align_slide_count_with_target(fallback, target_pages)
    return CoursewareOutline(
        title=fallback.title,
        sections=fallback.sections,
        total_slides=fallback.total_slides,
        summary="基础教学大纲",
    )
