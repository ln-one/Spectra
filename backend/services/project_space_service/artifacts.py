"""Artifact helpers for Project Space service."""

import asyncio
import html
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from schemas.project_space import ArtifactType
from services.artifact_generator import artifact_generator
from services.chunking import split_text
from services.file_upload_service.constants import (
    UploadStatus,
)
from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT
from services.rag_service import ParsedChunkData, rag_service
from utils.exceptions import ValidationException

from .artifact_semantics import (
    ARTIFACT_MODE_KIND_MAP,
    SUPPORTED_FILE_ARTIFACT_TYPES,
    ArtifactMetadataKind,
    default_artifact_content,
    get_artifact_capability,
    normalize_artifact_type,
    normalize_artifact_visibility,
)

logger = logging.getLogger(__name__)

_ARTIFACT_SOURCE_TYPE = "ai_generated"
_ACCRETION_CHUNK_SIZE = 500
_ACCRETION_CHUNK_OVERLAP = 50
_SUPPORTED_ARTIFACT_MODES = {"create", "replace"}


def _stringify_nodes(nodes: list[dict]) -> list[str]:
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


def _build_artifact_accretion_text(
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
            lines.extend(_stringify_nodes(raw_nodes))

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

    deduped_lines = [line for line in lines if line and line.strip()]
    return "\n".join(deduped_lines).strip()


def _derive_artifact_upload_filename(
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


def _normalize_artifact_mode(mode: Optional[str]) -> str:
    mode = str(mode or "create").strip().lower()
    if mode not in _SUPPORTED_ARTIFACT_MODES:
        raise ValidationException(
            f"Unsupported artifact mode '{mode}'. "
            f"Supported modes: {', '.join(sorted(_SUPPORTED_ARTIFACT_MODES))}"
        )
    return mode


def _parse_artifact_metadata(raw_metadata: Any) -> Dict[str, Any]:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            logger.warning("artifact metadata is not valid JSON during replace flow")
    return {}


async def _silently_accrete_artifact(
    *,
    db,
    artifact,
    project_id: str,
    artifact_type: str,
    visibility: str,
    session_id: Optional[str],
    based_on_version_id: Optional[str],
    normalized_content: Dict[str, Any],
) -> None:
    if not all(
        hasattr(db, attr)
        for attr in (
            "create_upload",
            "update_file_intent",
            "update_upload_status",
            "create_parsed_chunks",
        )
    ):
        return

    text = _build_artifact_accretion_text(artifact_type, normalized_content)
    if not text:
        return

    title = normalized_content.get("title")
    filename = _derive_artifact_upload_filename(artifact.id, artifact_type, title)
    storage_path = getattr(
        artifact, "storagePath", None
    ) or artifact_generator.get_storage_path(project_id, artifact_type, artifact.id)
    try:
        size = Path(storage_path).stat().st_size if storage_path else len(text.encode())
    except OSError:
        size = len(text.encode())

    upload = await db.create_upload(
        filename=filename,
        filepath=storage_path or f"artifacts/{filename}",
        size=size,
        project_id=project_id,
        file_type=artifact_type,
        mime_type="text/plain",
    )
    await db.update_file_intent(upload.id, SILENT_ACCRETION_USAGE_INTENT)

    metadata = {
        "filename": filename,
        "source_type": _ARTIFACT_SOURCE_TYPE,
        "source_project_id": project_id,
        "artifact_id": artifact.id,
        "artifact_type": artifact_type,
        "artifact_visibility": visibility,
        "based_on_version_id": based_on_version_id,
        "accretion": "silent",
    }
    if visibility == "private" and session_id:
        metadata["session_id"] = session_id

    chunks = split_text(
        text,
        chunk_size=_ACCRETION_CHUNK_SIZE,
        chunk_overlap=_ACCRETION_CHUNK_OVERLAP,
    ) or [text]
    chunk_payloads = [
        {
            "chunk_index": idx,
            "content": chunk,
            "metadata": dict(metadata),
        }
        for idx, chunk in enumerate(chunks)
    ]
    db_chunks = await db.create_parsed_chunks(
        upload_id=upload.id,
        source_type=_ARTIFACT_SOURCE_TYPE,
        chunks=chunk_payloads,
    )
    rag_chunks = [
        ParsedChunkData(
            chunk_id=db_chunk.id,
            content=payload["content"],
            metadata=payload["metadata"]
            | {"upload_id": upload.id, "chunk_index": payload["chunk_index"]},
        )
        for db_chunk, payload in zip(db_chunks, chunk_payloads)
    ]
    indexed_count = await rag_service.index_chunks(project_id, rag_chunks)
    await db.update_upload_status(
        upload.id,
        status=UploadStatus.READY.value,
        parse_result={
            "chunk_count": len(chunk_payloads),
            "indexed_count": indexed_count,
            "text_length": len(text),
            "source_type": _ARTIFACT_SOURCE_TYPE,
            "source_project_id": project_id,
            "artifact_id": artifact.id,
            "artifact_type": artifact_type,
            "artifact_visibility": visibility,
            "based_on_version_id": based_on_version_id,
            "silent_accretion": True,
        },
        error_message=None,
    )


def _build_animation_storyboard_html(content: Dict[str, Any]) -> str:
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
        and mode == ArtifactMetadataKind.ANIMATION_STORYBOARD.value
    ):
        normalized["html"] = incoming.get("html") or _build_animation_storyboard_html(
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
    title = content.get("title")
    if isinstance(title, str) and title.strip():
        metadata["title"] = title.strip()
    metadata["mode"] = artifact_mode
    metadata["is_current"] = True
    return metadata


async def get_artifact_storage_path(
    project_id: str, artifact_type: str, artifact_id: str
) -> str:
    """Generate storage path for an artifact."""
    return artifact_generator.get_storage_path(project_id, artifact_type, artifact_id)


async def create_artifact_with_file(
    db,
    project_id: str,
    artifact_type: str,
    visibility: str,
    user_id: str,
    session_id: Optional[str] = None,
    based_on_version_id: Optional[str] = None,
    content: Optional[Dict[str, Any]] = None,
    artifact_mode: Optional[str] = None,
) -> Any:
    """Create artifact record and generate the backing file."""
    artifact_type = normalize_artifact_type(artifact_type)
    visibility = normalize_artifact_visibility(visibility).value
    artifact_id = str(uuid.uuid4())
    storage_path = ""

    mode = _normalize_artifact_mode(artifact_mode)

    if based_on_version_id:
        version = await db.get_project_version(based_on_version_id)
        if not version or version.projectId != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} is invalid for project {project_id}"
            )
    else:
        project = await db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        if current_version_id:
            based_on_version_id = current_version_id

    normalized_content = normalize_artifact_content(artifact_type, content)

    replaced_artifact = None
    if mode == "replace":
        candidates = await db.get_project_artifacts(
            project_id,
            type_filter=artifact_type,
            visibility_filter=visibility,
            owner_user_id_filter=user_id,
            based_on_version_id_filter=None,
            session_id_filter=session_id,
        )
        if candidates:
            replaced_artifact = candidates[0]

    if artifact_type not in SUPPORTED_FILE_ARTIFACT_TYPES:
        raise ValidationException(
            f"Artifact type '{artifact_type}' file generation not yet supported. "
            f"Supported types: {', '.join(SUPPORTED_FILE_ARTIFACT_TYPES)}"
        )

    try:
        if artifact_type == ArtifactType.PPTX.value:
            actual_path = await artifact_generator.generate_pptx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.DOCX.value:
            actual_path = await artifact_generator.generate_docx(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.MINDMAP.value:
            actual_path = await artifact_generator.generate_mindmap(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.SUMMARY.value:
            actual_path = await artifact_generator.generate_summary(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.EXERCISE.value:
            actual_path = await artifact_generator.generate_quiz(
                normalized_content, project_id, artifact_id
            )
        elif artifact_type == ArtifactType.HTML.value:
            actual_path = await artifact_generator.generate_html(
                normalized_content.get("html", "<html><body>Empty</body></html>"),
                project_id,
                artifact_id,
            )
        elif artifact_type == ArtifactType.GIF.value:
            actual_path = await artifact_generator.generate_animation(
                normalized_content, project_id, artifact_id
            )
        else:
            actual_path = await artifact_generator.generate_video_placeholder(
                project_id, artifact_id
            )
        storage_path = actual_path
    except Exception as exc:
        logger.error(f"Failed to generate artifact file: {exc}")
        raise

    metadata = build_artifact_metadata(
        artifact_type,
        normalized_content,
        user_id,
        artifact_mode=mode,
    )
    if replaced_artifact is not None:
        metadata["replaces_artifact_id"] = replaced_artifact.id

    artifact = await db.create_artifact(
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        owner_user_id=user_id,
        storage_path=storage_path,
        metadata=metadata,
    )
    if replaced_artifact is not None and hasattr(db, "update_artifact_metadata"):
        replaced_metadata = _parse_artifact_metadata(
            getattr(replaced_artifact, "metadata", None)
        )
        replaced_metadata["superseded_by_artifact_id"] = artifact.id
        replaced_metadata["is_current"] = False
        await db.update_artifact_metadata(replaced_artifact.id, replaced_metadata)
    try:
        timeout_seconds = 8.0
        raw_timeout = os.getenv(
            "ARTIFACT_SILENT_ACCRETION_TIMEOUT_SECONDS",
            "8",
        ).strip()
        if raw_timeout:
            try:
                timeout_seconds = float(raw_timeout)
            except ValueError:
                timeout_seconds = 8.0
        coroutine = _silently_accrete_artifact(
            db=db,
            artifact=artifact,
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            normalized_content=normalized_content,
        )
        if timeout_seconds > 0:
            await asyncio.wait_for(coroutine, timeout=timeout_seconds)
        else:
            await coroutine
    except asyncio.TimeoutError:
        logger.warning(
            "artifact_silent_accretion_timeout: artifact=%s project=%s timeout=%s",
            getattr(artifact, "id", None),
            project_id,
            timeout_seconds,
        )
    except Exception as exc:
        logger.warning(
            "artifact_silent_accretion_failed: artifact=%s project=%s error=%s",
            getattr(artifact, "id", None),
            project_id,
            exc,
            exc_info=True,
        )
    return artifact
