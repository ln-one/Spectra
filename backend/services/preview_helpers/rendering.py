import re

from schemas.preview import (
    ImageInsertionMetadata,
    LessonPlan,
    Slide,
    SlidePlan,
    SourceReference,
    SourceType,
)


def _parse_marp_slides(markdown_content: str) -> list[dict]:
    content = str(markdown_content or "").strip()
    frontmatter_match = re.match(r"^---\s*\n[\s\S]*?\n---\s*\n?", content)
    if frontmatter_match:
        content = content[frontmatter_match.end() :]

    raw_slides = re.split(r"\n---\s*\n", content)
    slides: list[dict] = []
    for index, raw in enumerate(raw_slides):
        raw = raw.strip()
        if not raw:
            continue
        title_match = re.match(r"^#\s+(.+)$", raw, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""
        slides.append({"index": index, "title": title, "content": raw})
    return slides


def build_slides(
    task_id: str,
    markdown_content: str,
    image_metadata: dict | None = None,
    render_markdown: str | None = None,
) -> list[Slide]:
    # 优先使用 render_markdown
    source = render_markdown if render_markdown else markdown_content
    raw_slides = _parse_marp_slides(source)
    slides_meta = (
        (image_metadata or {}).get("slides_metadata", []) if image_metadata else []
    )
    meta_by_index = {
        m.get("slide_index"): m for m in slides_meta if isinstance(m, dict)
    }

    slides = []
    for slide in raw_slides:
        slide_id = f"{task_id}-slide-{slide['index']}"
        slide_meta = meta_by_index.get(slide["index"])
        img_meta = None
        if slide_meta:
            img_meta = ImageInsertionMetadata(
                retrieval_mode=(
                    image_metadata.get("retrieval_mode") if image_metadata else None
                ),
                page_semantic_type=slide_meta.get("page_semantic_type"),
                image_insertion_decision=slide_meta.get("image_insertion_decision"),
                image_count=slide_meta.get("image_count"),
                image_slot=slide_meta.get("image_slot"),
                layout_risk_level=slide_meta.get("layout_risk_level"),
                image_match_reason=slide_meta.get("image_match_reason"),
                skip_reason=slide_meta.get("skip_reason"),
            )
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
                image_metadata=img_meta,
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
