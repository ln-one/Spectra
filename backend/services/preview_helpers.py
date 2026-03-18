"""
Preview Helpers - 预览相关辅助函数

从 routers/preview.py 拆分，包含缓存、Slide 构建、LessonPlan 构建。
"""

import html
import json
import logging
import re
from pathlib import Path
from typing import Optional, Tuple

from schemas.preview import LessonPlan, Slide, SlidePlan, SourceReference, SourceType
from services.database import db_service

logger = logging.getLogger(__name__)

GENERATED_DIR = Path("generated")


def cache_path(task_id: str) -> Path:
    """预览缓存文件路径"""
    return GENERATED_DIR / f"{task_id}_preview.json"


async def load_preview_content(task_id: str) -> Optional[dict]:
    """从缓存文件加载预览内容"""
    path = cache_path(task_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


async def save_preview_content(task_id: str, data: dict) -> None:
    """保存预览内容到缓存文件"""
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(task_id).write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )


async def get_or_generate_content(task, project) -> dict:
    """获取预览内容：优先读缓存，否则重新生成并缓存"""
    cached = await load_preview_content(task.id)
    if cached:
        return cached

    task_status = getattr(task, "status", None)
    if task_status in {"pending", "processing"}:
        return {
            "title": project.name or "Generating",
            "markdown_content": "",
            "lesson_plan_markdown": "",
        }

    from services.ai import ai_service

    messages = await db_service.get_recent_conversation_messages(project.id, limit=5)
    user_msgs = [m.content for m in messages if m.role == "user"]
    user_requirements = "\n".join(user_msgs) if user_msgs else project.name

    outline_document = None
    outline_version = None
    session_id = getattr(task, "sessionId", None)
    if session_id:
        latest_outline = await db_service.db.outlineversion.find_first(
            where={"sessionId": session_id},
            order={"version": "desc"},
        )
        if latest_outline and latest_outline.outlineData:
            try:
                outline_document = json.loads(latest_outline.outlineData)
                outline_version = latest_outline.version
            except json.JSONDecodeError:
                logger.warning(
                    "Failed to decode outlineData for session %s", session_id
                )

    courseware = await ai_service.generate_courseware_content(
        project_id=project.id,
        user_requirements=user_requirements,
        outline_document=outline_document,
        outline_version=outline_version,
    )
    data = {
        "title": courseware.title,
        "markdown_content": courseware.markdown_content,
        "lesson_plan_markdown": courseware.lesson_plan_markdown,
    }
    await save_preview_content(task.id, data)
    return data


def build_slides(task_id: str, markdown_content: str) -> list[Slide]:
    """将 Marp Markdown 解析为 Slide 列表"""
    from services.courseware_ai import CoursewareAIMixin

    raw_slides = CoursewareAIMixin.parse_marp_slides(markdown_content)
    slides = []
    for s in raw_slides:
        slide_id = f"{task_id}-slide-{s['index']}"
        slides.append(
            Slide(
                id=slide_id,
                index=s["index"],
                title=s["title"],
                content=s["content"],
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
    """从教案 Markdown 构建 LessonPlan 结构"""
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


def build_artifact_anchor(session_id: str, artifact) -> dict:
    """Build unified artifact anchor payload for session-scope responses."""
    return {
        "session_id": session_id,
        "artifact_id": artifact.id if artifact else None,
        "based_on_version_id": (
            getattr(artifact, "basedOnVersionId", None) if artifact else None
        ),
    }


def ensure_previewable_state(snapshot: dict) -> None:
    """Validate whether the session state can serve preview content."""
    session_state = snapshot["session"]["state"]
    if session_state not in ("SUCCESS", "RENDERING", "GENERATING_CONTENT"):
        raise ValueError(f"当前状态 {session_state} 不支持预览，需等待生成完成")


def ensure_exportable_state(
    snapshot: dict, expected_render_version: Optional[int]
) -> None:
    """Validate export preconditions from session snapshot."""
    if snapshot["session"]["state"] != "SUCCESS":
        raise ValueError("只有状态为 SUCCESS 的会话才能导出")

    if expected_render_version is None:
        return

    current_render_version = snapshot["session"].get("render_version") or 1
    if current_render_version != expected_render_version:
        raise RuntimeError(
            f"渲染版本冲突：期望 {expected_render_version}，当前 {current_render_version}"
        )


def strip_sources(
    slides: list[dict], lesson_plan: Optional[dict]
) -> Tuple[list[dict], Optional[dict]]:
    """Drop source arrays from preview payload when include_sources=False."""
    slides_clean = []
    for slide in slides:
        item = dict(slide)
        item["sources"] = []
        slides_clean.append(item)

    lesson_plan_clean = None
    if lesson_plan:
        lesson_plan_clean = dict(lesson_plan)
        plans = []
        for plan in lesson_plan_clean.get("slides_plan", []) or []:
            plan_item = dict(plan)
            plan_item["material_sources"] = []
            plans.append(plan_item)
        lesson_plan_clean["slides_plan"] = plans
    return slides_clean, lesson_plan_clean


def build_preview_payload(
    session_id: str,
    snapshot: dict,
    task,
    slides: list[dict],
    lesson_plan: Optional[dict],
    anchor: dict,
) -> dict:
    """Build preview response payload for session-scope preview APIs."""
    return {
        "session_id": session_id,
        "task_id": task.id if task else None,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "artifact_anchor": anchor,
        "render_version": snapshot["session"].get("render_version") or 1,
        "slides": slides,
        "lesson_plan": lesson_plan,
    }


def build_modify_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    result: Optional[dict],
) -> dict:
    """Build response payload for preview modify requests."""
    payload = {
        "session_id": session_id,
        "modify_task_id": (result.get("task_id") if isinstance(result, dict) else None)
        or f"modify-{session_id}",
        "status": "pending",
        "render_version": snapshot["session"].get("render_version") or 1,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "artifact_anchor": anchor,
    }
    if isinstance(result, dict):
        payload.update(result)
    return payload


def resolve_slide_preview(
    slide_id: str, slides: list[dict], lesson_plan: Optional[dict]
) -> Tuple[dict, Optional[dict], list[dict]]:
    """Resolve a single slide preview payload from rendered preview materials."""
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


def build_slide_preview_payload(
    session_id: str,
    anchor: dict,
    selected_slide: dict,
    teaching_plan: Optional[dict],
    related_slides: list[dict],
) -> dict:
    """Build response payload for slide preview API."""
    return {
        "session_id": session_id,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "artifact_anchor": anchor,
        "slide": selected_slide,
        "teaching_plan": teaching_plan,
        "related_slides": related_slides,
    }


def build_export_payload(
    session_id: str,
    snapshot: dict,
    task,
    slides: list[dict],
    lesson_plan: Optional[dict],
    content: dict,
    anchor: dict,
    export_format: str,
    include_sources: bool,
) -> dict:
    """Build export payload for preview export API."""
    if not include_sources:
        slides, lesson_plan = strip_sources(slides, lesson_plan)

    markdown_content = content.get("markdown_content", "")
    normalized_format = export_format.lower()
    if normalized_format == "json":
        export_content = json.dumps(
            {
                "session_id": session_id,
                "slides": slides,
                "lesson_plan": lesson_plan,
                "markdown_content": markdown_content,
            },
            ensure_ascii=False,
        )
    elif normalized_format == "html":
        export_content = (
            "<!doctype html><html><body><pre>"
            + html.escape(markdown_content)
            + "</pre></body></html>"
        )
    else:
        normalized_format = "markdown"
        export_content = markdown_content

    result = snapshot.get("result") or {}
    return {
        "session_id": session_id,
        "task_id": task.id if task else None,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "artifact_anchor": anchor,
        "content": export_content,
        "format": normalized_format,
        "render_version": snapshot["session"].get("render_version") or 1,
        "ppt_url": result.get("ppt_url"),
        "word_url": result.get("word_url"),
        "version": result.get("version"),
    }


async def load_preview_material(session_id: str, project_id: str):
    """Load task + rendered preview materials for preview/export APIs."""
    tasks = await db_service.db.generationtask.find_many(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        take=1,
    )
    task = tasks[0] if tasks else None

    slides: list[dict] = []
    lesson_plan: Optional[dict] = None
    content: dict = {}
    if task:
        try:
            project = await db_service.get_project(project_id)
            if not project:
                raise ValueError("project not found for preview")
            content = await get_or_generate_content(task, project)
            slide_models = build_slides(task.id, content.get("markdown_content", ""))
            slides = [s.model_dump() for s in slide_models]
            lesson_plan = build_lesson_plan(
                slide_models,
                content.get("lesson_plan_markdown", ""),
            ).model_dump()
        except Exception as preview_err:
            logger.warning(
                "Session preview content generation failed, using fallback: %s",
                preview_err,
                exc_info=True,
            )
    return task, slides, lesson_plan, content
