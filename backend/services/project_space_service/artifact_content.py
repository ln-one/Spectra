"""Artifact content normalization and metadata helpers."""

import html
from typing import Any, Dict, Optional

from schemas.project_space import ArtifactType

from .artifact_semantics import (
    ARTIFACT_MODE_KIND_MAP,
    ArtifactMetadataKind,
    default_artifact_content,
    get_artifact_capability,
)


def stringify_nodes(nodes: list[dict]) -> list[str]:
    lines: list[str] = []

    def visit(node: dict, depth: int = 0) -> None:
        title = str(node.get("title") or "").strip()
        if title:
            lines.append(f'{"  " * depth}- {title}')
        for key in ("summary", "description", "content"):
            value = str(node.get(key) or "").strip()
            if value:
                lines.append(f'{"  " * (depth + 1)}{value}')
        for child in node.get("children") or []:
            if isinstance(child, dict):
                visit(child, depth + 1)

    for node in nodes or []:
        if isinstance(node, dict):
            visit(node)
    return lines


def build_artifact_accretion_text(
    artifact_type: str,
    content: Optional[Dict[str, Any]],
) -> str:
    normalized = normalize_artifact_content(artifact_type, content)
    lines: list[str] = []
    title = str(normalized.get("title") or "").strip()
    if title:
        lines.append(f"标题：{title}")
    kind = str(normalized.get("kind") or "").strip()
    if kind:
        lines.append(f"类型：{kind}")

    for key in ("summary", "description", "html", "markdown_content", "prompt"):
        value = str(normalized.get(key) or "").strip()
        if value:
            lines.append(value)

    for node_key in ("nodes", "mindmap", "sections"):
        raw_nodes = normalized.get(node_key)
        if isinstance(raw_nodes, list):
            lines.extend(stringify_nodes(raw_nodes))

    questions = normalized.get("questions") or normalized.get("items") or []
    for item in questions:
        if not isinstance(item, dict):
            continue
        stem = str(item.get("question") or item.get("title") or "").strip()
        if stem:
            lines.append(f"题目：{stem}")
        for option in item.get("options") or []:
            lines.append(f"- {option}")
        answer = item.get("answer")
        if answer:
            lines.append(f"答案：{answer}")
        explanation = str(item.get("explanation") or "").strip()
        if explanation:
            lines.append(f"解析：{explanation}")

    scenes = normalized.get("scenes") or []
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        scene_title = str(scene.get("title") or "").strip()
        scene_description = str(scene.get("description") or "").strip()
        if scene_title:
            lines.append(f"场景：{scene_title}")
        if scene_description:
            lines.append(scene_description)

    for slide in normalized.get("slides") or []:
        if not isinstance(slide, dict):
            continue
        page = slide.get("page")
        slide_title = str(slide.get("title") or "").strip()
        if slide_title or page is not None:
            lines.append(f"讲稿页 {page or '?'}：{slide_title}".strip("："))
        for key in ("script", "action_hint", "transition_line"):
            value = str(slide.get(key) or "").strip()
            if value:
                lines.append(value)

    for turn in normalized.get("turns") or []:
        if not isinstance(turn, dict):
            continue
        question = str(turn.get("question") or "").strip()
        if question:
            lines.append(f"追问：{question}")
        teacher_answer = str(turn.get("teacher_answer") or "").strip()
        if teacher_answer:
            lines.append(f"教师作答：{teacher_answer}")
        feedback = str(turn.get("feedback") or "").strip()
        if feedback:
            lines.append(f"反馈：{feedback}")
        score = turn.get("score")
        if score not in (None, ""):
            lines.append(f"评分：{score}")

    deduped_lines = [line for line in lines if line and line.strip()]
    return "\n".join(deduped_lines).strip()


def derive_artifact_upload_filename(
    artifact_id: str,
    artifact_type: str,
    title: Optional[str],
) -> str:
    safe_title = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "-"
        for ch in str(title or "").strip()
    ).strip("-")
    prefix = safe_title or artifact_type or "artifact"
    return f"{prefix[:48]}-{artifact_id[:8]}.{artifact_type}"


def build_animation_storyboard_html(content: Dict[str, Any]) -> str:
    title = html.escape(content.get("title", "Animation Storyboard"))
    scenes = content.get("scenes") or [
        {
            "title": "Scene 1",
            "description": content.get("summary") or "待补充镜头说明",
        }
    ]
    scene_blocks = []
    for idx, scene in enumerate(scenes, start=1):
        scene_title = html.escape(str(scene.get("title") or f"Scene {idx}"))
        scene_description = html.escape(str(scene.get("description") or ""))
        scene_blocks.append(
            "<section>"
            f"<h2>Scene {idx}: {scene_title}</h2>"
            f"<p>{scene_description}</p>"
            "</section>"
        )
    return (
        "<!doctype html><html><body>"
        f"<h1>{title}</h1>" + "".join(scene_blocks) + "</body></html>"
    )


def normalize_artifact_content(
    artifact_type: str,
    content: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    normalized = default_artifact_content(artifact_type)
    incoming = dict(content or {})
    normalized.update(incoming)

    mode = str(incoming.get("mode") or "").strip().lower()
    title_and_kind = ARTIFACT_MODE_KIND_MAP.get((artifact_type, mode))
    if title_and_kind:
        title, kind = title_and_kind
        normalized.setdefault("title", title)
        normalized["kind"] = kind

    if (
        artifact_type == ArtifactType.SUMMARY.value
        and mode == ArtifactMetadataKind.OUTLINE.value
    ):
        normalized["nodes"] = normalized.get("nodes") or []
    elif (
        artifact_type == ArtifactType.HTML.value
        and incoming.get("kind") == "interactive_game"
    ):
        normalized["kind"] = "interactive_game"
    elif (
        artifact_type == ArtifactType.HTML.value
        and mode == ArtifactMetadataKind.ANIMATION_STORYBOARD.value
    ):
        normalized["html"] = incoming.get("html") or build_animation_storyboard_html(
            normalized
        )
    return normalized


def build_artifact_metadata(
    artifact_type: str,
    content: Dict[str, Any],
    user_id: str,
    artifact_mode: str = "create",
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {
        "created_by": user_id,
        "capability": get_artifact_capability(artifact_type),
    }
    kind = str(content.get("kind") or "").strip()
    if kind:
        metadata["kind"] = kind
    if kind == "animation_storyboard" or artifact_type in {
        ArtifactType.GIF.value,
        ArtifactType.MP4.value,
    }:
        metadata["content_snapshot"] = dict(content)
        for key in (
            "format",
            "render_mode",
            "cloud_video_provider",
            "cloud_video_model",
            "cloud_video_task_id",
            "cloud_video_status",
            "cloud_video_result_url",
            "cloud_video_error",
            "first_frame_asset_url",
            "cloud_video_prompt",
            "video_prompt",
            "duration_seconds",
            "rhythm",
            "focus",
            "visual_type",
            "topic",
            "summary",
            "placements",
            "render_spec",
            "runtime_version",
            "runtime_graph_version",
            "runtime_graph",
            "runtime_draft_version",
            "runtime_draft",
            "runtime_attempt_count",
            "runtime_provider",
            "runtime_model",
            "runtime_validation_report",
            "component_code",
            "compile_status",
            "compile_errors",
            "family_hint",
            "scene_outline",
            "used_primitives",
            "generation_prompt_digest",
            "runtime_source",
            "runtime_contract",
        ):
            if key in content:
                metadata[key] = content[key]
    elif artifact_type in {
        ArtifactType.DOCX.value,
        ArtifactType.MINDMAP.value,
        ArtifactType.SUMMARY.value,
        ArtifactType.EXERCISE.value,
    }:
        metadata["content_snapshot"] = dict(content)
    elif artifact_type == ArtifactType.HTML.value and kind == "interactive_game":
        metadata["content_snapshot"] = dict(content)
        for key in (
            "title",
            "summary",
            "game_pattern",
            "compatibility_zone",
            "runtime_origin",
        ):
            if key in content:
                metadata[key] = content[key]
    title = content.get("title")
    if isinstance(title, str) and title.strip():
        metadata["title"] = title.strip()
    metadata["mode"] = artifact_mode
    metadata["is_current"] = True
    return metadata
