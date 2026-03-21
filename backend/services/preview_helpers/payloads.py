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
    if snapshot["session"]["state"] != GenerationState.SUCCESS.value:
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


def build_preview_payload(
    session_id: str,
    snapshot: dict,
    task,
    slides: list[dict],
    lesson_plan: Optional[dict],
    anchor: dict,
) -> dict:
    return {
        "session_id": session_id,
        "task_id": task.id if task else None,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
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
    payload = {
        "session_id": session_id,
        "modify_task_id": (result.get("task_id") if isinstance(result, dict) else None)
        or f"modify-{session_id}",
        "status": TaskStatus.PENDING,
        "render_version": snapshot["session"].get("render_version") or 1,
        "artifact_id": anchor["artifact_id"],
        "based_on_version_id": anchor["based_on_version_id"],
        "current_version_id": snapshot.get("current_version_id"),
        "upstream_updated": bool(snapshot.get("upstream_updated")),
        "artifact_anchor": anchor,
    }
    if isinstance(result, dict):
        payload.update(result)
    return payload


def build_slide_preview_payload(
    session_id: str,
    snapshot: dict,
    anchor: dict,
    selected_slide: dict,
    teaching_plan: Optional[dict],
    related_slides: list[dict],
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

    result = build_generation_result_payload(
        ppt_url=(snapshot.get("result") or {}).get("ppt_url"),
        word_url=(snapshot.get("result") or {}).get("word_url"),
        version=(snapshot.get("result") or {}).get("version"),
    )
    return {
        "session_id": session_id,
        "task_id": task.id if task else None,
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
