import html
import json
from typing import Optional

from schemas.generation import TaskStatus, build_generation_result_payload
from services.platform.state_transition_guard import GenerationState


def build_artifact_anchor(session_id: str, artifact) -> dict:
    return {
        "session_id": session_id,
        "artifact_id": artifact.id if artifact else None,
        "based_on_version_id": (
            getattr(artifact, "basedOnVersionId", None) if artifact else None
        ),
    }


def ensure_previewable_state(snapshot: dict) -> None:
    session_state = snapshot["session"]["state"]
    if session_state not in {
        GenerationState.SUCCESS.value,
        GenerationState.RENDERING.value,
        GenerationState.GENERATING_CONTENT.value,
        GenerationState.FAILED.value,
        GenerationState.AWAITING_OUTLINE_CONFIRM.value,
        GenerationState.DRAFTING_OUTLINE.value,
    }:
        raise ValueError(f"当前状态 {session_state} 不支持预览")


def ensure_exportable_state(
    snapshot: dict, expected_render_version: Optional[int]
) -> None:
    session_state = snapshot["session"]["state"]
    has_exportable_artifact = bool(snapshot.get("artifact_id"))
    if session_state != GenerationState.SUCCESS.value and not has_exportable_artifact:
        raise ValueError("当前会话暂无可导出的产物")

    if expected_render_version is None:
        return

    current_render_version = snapshot["session"].get("render_version") or 1
    if current_render_version != expected_render_version:
        raise RuntimeError(
            f"渲染版本冲突：期望 {expected_render_version}，当前 {current_render_version}"
        )


def strip_sources(
    slides: list[dict], lesson_plan: Optional[dict]
) -> tuple[list[dict], Optional[dict]]:
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


def _resolved_export_markdown(content: dict) -> str:
    resolved = content.get("resolved_markdown_content")
    if isinstance(resolved, str) and resolved.strip():
        return resolved

    markdown_content = content.get("markdown_content")
    if isinstance(markdown_content, str) and markdown_content.strip():
        return markdown_content

    render_markdown = content.get("render_markdown")
    if isinstance(render_markdown, str) and render_markdown.strip():
        return render_markdown

    return ""


def build_preview_payload(
    session_id: str,
    snapshot: dict,
    slides: list[dict],
    lesson_plan: Optional[dict],
    anchor: dict,
    content: Optional[dict] = None,
    rendered_preview: Optional[dict] = None,
) -> dict:
    content = content or {}
    slides_content_markdown = _resolved_export_markdown(content)
    return {
        "session_id": session_id,
        "session_state": snapshot["session"].get("state"),
        "session_state_reason": snapshot["session"].get("stateReason"),
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "render_version": snapshot["session"].get("render_version") or 1,
        "slides": slides,
        "lesson_plan": lesson_plan,
        "slides_content_markdown": slides_content_markdown,
        "slides_content_ready": bool(slides_content_markdown.strip()),
        "rendered_preview": rendered_preview,
    }


def build_modify_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    result: Optional[dict],
) -> dict:
    payload = {
        "session_id": session_id,
        "status": TaskStatus.PENDING,
        "render_version": snapshot["session"].get("render_version") or 1,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
    }
    if isinstance(result, dict):
        payload.update({key: value for key, value in result.items() if key != "task_id"})
    return payload


def build_slide_preview_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    selected_slide: dict,
    teaching_plan: Optional[dict],
    related_slides: list[dict],
    rendered_page: Optional[dict] = None,
) -> dict:
    return {
        "session_id": session_id,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "slide": selected_slide,
        "teaching_plan": teaching_plan,
        "related_slides": related_slides,
        "rendered_page": rendered_page,
    }


def build_export_payload(
    session_id: str,
    snapshot: dict,
    slides: list[dict],
    lesson_plan: Optional[dict],
    content: dict,
    anchor: dict,
    export_format: str,
    include_sources: bool,
) -> dict:
    if not include_sources:
        slides, lesson_plan = strip_sources(slides, lesson_plan)

    source_content = _resolved_export_markdown(content)

    normalized_format = export_format.lower()
    if normalized_format == "json":
        export_content = json.dumps(
            {
                "session_id": session_id,
                "slides": slides,
                "lesson_plan": lesson_plan,
                "markdown_content": source_content,
            },
            ensure_ascii=False,
        )
    elif normalized_format == "html":
        export_content = (
            "<!doctype html><html><body><pre>"
            + html.escape(source_content)
            + "</pre></body></html>"
        )
    else:
        normalized_format = "markdown"
        export_content = source_content

    result = build_generation_result_payload(
        ppt_url=(snapshot.get("result") or {}).get("ppt_url"),
        word_url=(snapshot.get("result") or {}).get("word_url"),
        version=(snapshot.get("result") or {}).get("version"),
    )
    return {
        "session_id": session_id,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
        "content": export_content,
        "format": normalized_format,
        "render_version": snapshot["session"].get("render_version") or 1,
        "ppt_url": result.get("ppt_url"),
        "word_url": result.get("word_url"),
        "version": result.get("version"),
    }
