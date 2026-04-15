import json
import logging
from typing import Optional

from schemas.generation import TaskStatus

from .cache import load_preview_content, save_preview_content

logger = logging.getLogger(__name__)


def build_fallback_preview_payload(project_name: str) -> dict:
    return {
        "title": project_name or "课件预览",
        "markdown_content": "",
        "lesson_plan_markdown": "",
    }


def build_outline_preview_payload(
    project_name: str,
    outline_document: Optional[dict],
) -> Optional[dict]:
    nodes = (
        (outline_document or {}).get("nodes")
        if isinstance(outline_document, dict)
        else None
    )
    if not isinstance(nodes, list) or not nodes:
        return None

    sorted_nodes = sorted(
        [node for node in nodes if isinstance(node, dict)],
        key=lambda item: int(item.get("order") or 0),
    )
    if not sorted_nodes:
        return None

    markdown_slides: list[str] = []
    lesson_plan_lines: list[str] = [
        "# 教学目标",
        "- 形成完整知识框架并完成课堂讲解闭环",
        "",
        "# 教学过程",
    ]
    for node in sorted_nodes:
        title = str(node.get("title") or "教学内容").strip()
        key_points = [
            str(point).strip()
            for point in (node.get("key_points") or [])
            if str(point).strip()
        ]
        slide_lines = [f"# {title}"]
        if key_points:
            slide_lines.extend([f"- {point}" for point in key_points[:6]])
        else:
            slide_lines.append("- 核心要点讲解")
        markdown_slides.append("\n".join(slide_lines))

        lesson_plan_lines.extend(
            [
                f"## {title}",
                f"- 教学目标：完成 {title} 的理解与表达",
                f"- 教师提示：围绕“{'；'.join(key_points[:3]) or '核心要点'}”组织提问与板书",
            ]
        )

    return {
        "title": project_name or "课件预览",
        "markdown_content": "\n\n---\n\n".join(markdown_slides),
        "lesson_plan_markdown": "\n".join(lesson_plan_lines),
    }


def parse_preview_content_from_input_data(raw_input_data: object) -> Optional[dict]:
    if not raw_input_data:
        return None
    if not isinstance(raw_input_data, str):
        return None
    try:
        payload = json.loads(raw_input_data)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    preview_content = payload.get("preview_content")
    if not isinstance(preview_content, dict):
        return None

    title = preview_content.get("title")
    markdown_content = preview_content.get("markdown_content")
    lesson_plan_markdown = preview_content.get("lesson_plan_markdown")
    if not isinstance(title, str):
        return None
    if not isinstance(markdown_content, str):
        return None
    if not isinstance(lesson_plan_markdown, str):
        return None
    rendered_preview = preview_content.get("rendered_preview")
    normalized = {
        "title": title,
        "markdown_content": markdown_content,
        "lesson_plan_markdown": lesson_plan_markdown,
    }
    render_markdown = preview_content.get("render_markdown")
    if isinstance(render_markdown, str) and render_markdown.strip():
        normalized["render_markdown"] = render_markdown
    resolved_markdown_content = preview_content.get("resolved_markdown_content")
    if isinstance(resolved_markdown_content, str) and resolved_markdown_content.strip():
        normalized["resolved_markdown_content"] = resolved_markdown_content
    style_manifest = preview_content.get("style_manifest")
    if isinstance(style_manifest, dict):
        normalized["style_manifest"] = style_manifest
    extra_css = preview_content.get("extra_css")
    if isinstance(extra_css, str) and extra_css.strip():
        normalized["extra_css"] = extra_css
    page_class_plan = preview_content.get("page_class_plan")
    if isinstance(page_class_plan, list) and all(
        isinstance(item, dict) for item in page_class_plan
    ):
        normalized["page_class_plan"] = page_class_plan
    image_metadata = preview_content.get("_image_metadata")
    if isinstance(image_metadata, dict):
        normalized["_image_metadata"] = image_metadata
    if isinstance(rendered_preview, dict):
        normalized["rendered_preview"] = rendered_preview
    return normalized


def parse_task_input_data(raw_input_data: object) -> dict:
    if not raw_input_data:
        return {}
    if isinstance(raw_input_data, dict):
        return raw_input_data
    if not isinstance(raw_input_data, str):
        return {}
    try:
        payload = json.loads(raw_input_data)
    except (TypeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _is_ppt_task(task: object) -> bool:
    output_type = str(getattr(task, "outputType", "") or "").strip().lower()
    if output_type in {"ppt", "both"}:
        return True
    tool_type = str(getattr(task, "toolType", "") or "").strip().lower()
    return tool_type in {"courseware_ppt", "studio_card:courseware_ppt"}


async def get_or_generate_content(
    task,
    project,
    db_service,
    *,
    load_preview_content_fn=load_preview_content,
    save_preview_content_fn=save_preview_content,
) -> dict:
    cached = await load_preview_content_fn(task.id)
    if cached:
        return cached

    persisted = parse_preview_content_from_input_data(getattr(task, "inputData", None))
    if persisted:
        try:
            await save_preview_content_fn(task.id, persisted)
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "Failed to rehydrate preview cache from task inputData for task %s: %s",
                task.id,
                exc,
            )
        return persisted

    task_input = parse_task_input_data(getattr(task, "inputData", None))
    outline_version_hint = task_input.get("outline_version")
    if isinstance(outline_version_hint, bool):
        outline_version_hint = None
    try:
        parsed_outline_version_hint = (
            int(outline_version_hint) if outline_version_hint is not None else None
        )
    except (TypeError, ValueError):
        parsed_outline_version_hint = None
    if parsed_outline_version_hint is not None and parsed_outline_version_hint < 1:
        parsed_outline_version_hint = None

    session_id = getattr(task, "sessionId", None)
    outline_document = None
    outline_version = None
    template_config = None
    raw_template = getattr(task, "templateConfig", None)
    if raw_template:
        try:
            template_config = json.loads(raw_template)
        except (TypeError, json.JSONDecodeError):
            logger.warning("Failed to decode templateConfig for task %s", task.id)
            template_config = None

    if session_id:
        outline_record = (
            await db_service.db.outlineversion.find_first(
                where={
                    "sessionId": session_id,
                    "version": parsed_outline_version_hint,
                },
            )
            if parsed_outline_version_hint is not None
            else await db_service.db.outlineversion.find_first(
                where={"sessionId": session_id},
                order={"version": "desc"},
            )
        )
        if outline_record and outline_record.outlineData:
            try:
                outline_document = json.loads(outline_record.outlineData)
                outline_version = outline_record.version
            except json.JSONDecodeError:
                logger.warning(
                    "Failed to decode outlineData for session %s", session_id
                )

    task_status = getattr(task, "status", None)
    if task_status in {TaskStatus.PENDING, TaskStatus.PROCESSING}:
        return build_fallback_preview_payload(project.name or "Generating")
    if task_status == TaskStatus.FAILED:
        outline_preview = build_outline_preview_payload(project.name, outline_document)
        if outline_preview:
            try:
                await save_preview_content_fn(task.id, outline_preview)
            except Exception as exc:  # pragma: no cover
                logger.warning(
                    "Failed to cache outline fallback preview for task %s: %s",
                    task.id,
                    exc,
                )
            return outline_preview
        return build_fallback_preview_payload(project.name)

    if _is_ppt_task(task):
        outline_preview = build_outline_preview_payload(project.name, outline_document)
        if outline_preview:
            logger.info(
                "legacy_ppt_preview_rebuild_removed_use_outline session_id=%s task_id=%s",
                session_id,
                getattr(task, "id", None),
                extra={
                    "session_id": session_id,
                    "task_id": getattr(task, "id", None),
                    "tool_type": getattr(task, "toolType", None),
                    "reason": "legacy_ppt_preview_rebuild_removed",
                },
            )
            try:
                await save_preview_content_fn(task.id, outline_preview)
            except Exception as exc:  # pragma: no cover
                logger.warning(
                    "Failed to cache outline preview for PPT task %s: %s",
                    task.id,
                    exc,
                )
            return outline_preview
        logger.info(
            "legacy_ppt_preview_rebuild_removed_waiting_diego session_id=%s task_id=%s",
            session_id,
            getattr(task, "id", None),
            extra={
                "session_id": session_id,
                "task_id": getattr(task, "id", None),
                "tool_type": getattr(task, "toolType", None),
                "reason": "legacy_ppt_preview_rebuild_removed",
            },
        )
        return build_fallback_preview_payload(project.name)

    logger.info(
        "legacy_preview_ai_rebuild_removed task_id=%s session_id=%s",
        getattr(task, "id", None),
        session_id,
        extra={
            "task_id": getattr(task, "id", None),
            "session_id": session_id,
            "reason": "legacy_preview_ai_rebuild_removed",
        },
    )
    outline_preview = build_outline_preview_payload(project.name, outline_document)
    if outline_preview:
        try:
            await save_preview_content_fn(task.id, outline_preview)
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "Failed to cache outline fallback preview for task %s: %s",
                task.id,
                exc,
            )
        return outline_preview
    return build_fallback_preview_payload(project.name)
