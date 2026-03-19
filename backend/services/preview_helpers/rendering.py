import re

from schemas.preview import LessonPlan, Slide, SlidePlan, SourceReference, SourceType


def build_slides(task_id: str, markdown_content: str) -> list[Slide]:
    from services.courseware_ai import CoursewareAIMixin

    raw_slides = CoursewareAIMixin.parse_marp_slides(markdown_content)
    slides = []
    for slide in raw_slides:
        slide_id = f"{task_id}-slide-{slide['index']}"
        slides.append(
            Slide(
                id=slide_id,
                index=slide["index"],
                title=slide["title"],
                content=slide["content"],
                sources=[
                    SourceReference(
                        chunk_id="ai",
                        source_type=SourceType.AI_GENERATED,
                        filename="ai_generated",
                    )
                ],
            )
        )
    return slides


def build_lesson_plan(slides: list[Slide], lesson_plan_markdown: str) -> LessonPlan:
    objectives: list[str] = []
    obj_match = re.search(
        r"#\s*教学目标\s*\n([\s\S]*?)(?=\n#\s|\Z)",
        lesson_plan_markdown,
    )
    if obj_match:
        for line in obj_match.group(1).strip().splitlines():
            cleaned = line.strip().lstrip("- ")
            if cleaned:
                objectives.append(cleaned)

    plans = []
    for slide in slides:
        plans.append(
            SlidePlan(
                slide_id=slide.id,
                teaching_goal=slide.title or "教学内容",
                teacher_script=f"讲解：{slide.title}" if slide.title else "",
            )
        )

    return LessonPlan(teaching_objectives=objectives, slides_plan=plans)


def resolve_slide_preview(
    slide_id: str, slides: list[dict], lesson_plan: dict | None
) -> tuple[dict, dict | None, list[dict]]:
    selected_slide = next((item for item in slides if item.get("id") == slide_id), None)
    if selected_slide is None and slide_id.isdigit():
        idx = int(slide_id)
        selected_slide = next(
            (item for item in slides if item.get("index") == idx),
            None,
        )
    if not selected_slide:
        raise LookupError(f"幻灯片不存在: {slide_id}")

    plans = (lesson_plan or {}).get("slides_plan", []) if lesson_plan else []
    teaching_plan = next(
        (plan for plan in plans if plan.get("slide_id") == selected_slide.get("id")),
        None,
    )

    related_slides = []
    current_index = selected_slide.get("index")
    for item in slides:
        index = item.get("index")
        if not isinstance(index, int) or not isinstance(current_index, int):
            continue
        if index == current_index - 1:
            related_slides.append(
                {
                    "slide_id": item.get("id"),
                    "title": item.get("title", ""),
                    "relation": "previous",
                }
            )
        elif index == current_index + 1:
            related_slides.append(
                {
                    "slide_id": item.get("id"),
                    "title": item.get("title", ""),
                    "relation": "next",
                }
            )

    return selected_slide, teaching_plan, related_slides
