from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from typing import Any

from schemas.project_space import ArtifactType
from services.project_space_service import project_space_service
from utils.exceptions import APIException, ErrorCode

ANIMATION_SLOT_PRESETS = (
    "bottom-right",
    "right-panel",
    "bottom-panel",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def artifact_metadata_dict(artifact: Any) -> dict[str, Any]:
    raw_metadata = getattr(artifact, "metadata", None)
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def extract_animation_content_snapshot(artifact: Any) -> dict[str, Any]:
    metadata = artifact_metadata_dict(artifact)
    snapshot = metadata.get("content_snapshot")
    if isinstance(snapshot, dict):
        return copy.deepcopy(snapshot)
    return {
        "kind": "animation_storyboard",
        "format": "gif",
        "title": metadata.get("title") or "教学动画",
        "summary": metadata.get("summary") or "",
        "topic": metadata.get("topic"),
        "scene": metadata.get("scene"),
        "duration_seconds": metadata.get("duration_seconds"),
        "rhythm": metadata.get("rhythm"),
        "focus": metadata.get("focus"),
        "placements": metadata.get("placements") or [],
    }


def _normalize_page_number(raw_value: Any) -> int:
    try:
        page_number = int(raw_value)
    except (TypeError, ValueError):
        page_number = 1
    return max(1, page_number)


def _normalize_slot(raw_value: Any) -> str:
    value = str(raw_value or "").strip().lower()
    if value in ANIMATION_SLOT_PRESETS:
        return value
    return "bottom-right"


async def require_animation_artifact(project_id: str, artifact_id: str):
    artifact = await project_space_service.get_artifact(artifact_id)
    if not artifact or getattr(artifact, "projectId", None) != project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="动画成果不存在",
        )
    if getattr(artifact, "type", None) != ArtifactType.GIF.value:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="当前动画模块仅支持 GIF 成果",
        )
    metadata = artifact_metadata_dict(artifact)
    if str(metadata.get("kind") or "").strip() not in {"", "animation_storyboard"}:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="目标成果不是动画 artifact",
        )
    return artifact


async def require_ppt_artifact(project_id: str, artifact_id: str):
    artifact = await project_space_service.get_artifact(artifact_id)
    if not artifact or getattr(artifact, "projectId", None) != project_id:
        raise APIException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            message="PPT 成果不存在",
        )
    if getattr(artifact, "type", None) != ArtifactType.PPTX.value:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="插入目标必须是 PPT artifact",
        )
    return artifact


def build_animation_placement_recommendation(
    *,
    animation_artifact: Any,
    ppt_artifact: Any,
) -> dict[str, Any]:
    animation_metadata = artifact_metadata_dict(animation_artifact)
    ppt_metadata = artifact_metadata_dict(ppt_artifact)
    slide_count = ppt_metadata.get("slide_count") or ppt_metadata.get("page_count") or 0
    recommended_page = 2 if isinstance(slide_count, int) and slide_count >= 2 else 1
    summary_text = " ".join(
        str(item or "")
        for item in (
            animation_metadata.get("topic"),
            animation_metadata.get("summary"),
            animation_metadata.get("focus"),
        )
    ).lower()
    visual_type = str(animation_metadata.get("visual_type") or "").strip().lower()
    if visual_type == "structure_breakdown":
        recommended_slot = "bottom-panel"
    elif any(
        keyword in summary_text for keyword in ("compare", "process", "步骤", "流程")
    ):
        recommended_slot = "right-panel"
    else:
        recommended_slot = "right-panel"
    return {
        "ppt_artifact_id": getattr(ppt_artifact, "id", None),
        "recommended_page": recommended_page,
        "recommended_slot": recommended_slot,
        "slot_presets": list(ANIMATION_SLOT_PRESETS),
        "reason": (
            "default_first_content_page"
            if recommended_page == 2
            else "fallback_first_page"
        ),
        "generated_at": _utc_now_iso(),
    }


def build_animation_placement_records(
    *,
    ppt_artifact_id: str,
    page_numbers: list[int],
    slot: str,
) -> list[dict[str, Any]]:
    confirmed_at = _utc_now_iso()
    normalized_slot = _normalize_slot(slot)
    unique_pages = sorted({_normalize_page_number(item) for item in page_numbers})
    return [
        {
            "ppt_artifact_id": ppt_artifact_id,
            "page_number": page_number,
            "slot": normalized_slot,
            "status": "confirmed",
            "confirmed_at": confirmed_at,
        }
        for page_number in unique_pages
    ]


def apply_animation_placement_update(
    *,
    metadata: dict[str, Any],
    recommendation: dict[str, Any] | None = None,
    placement_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    next_metadata = dict(metadata)
    if recommendation is not None:
        next_metadata["placement_recommendation"] = recommendation
    if placement_records:
        existing = next_metadata.get("placements")
        placements = (
            [item for item in existing if isinstance(item, dict)]
            if isinstance(existing, list)
            else []
        )
        dedupe = {
            (
                str(item.get("ppt_artifact_id") or "").strip(),
                _normalize_page_number(item.get("page_number")),
                _normalize_slot(item.get("slot")),
            ): dict(item)
            for item in placements
        }
        for item in placement_records:
            dedupe[
                (
                    str(item.get("ppt_artifact_id") or "").strip(),
                    _normalize_page_number(item.get("page_number")),
                    _normalize_slot(item.get("slot")),
                )
            ] = dict(item)
        next_metadata["placements"] = list(dedupe.values())
    return next_metadata


def apply_ppt_animation_binding_update(
    *,
    metadata: dict[str, Any],
    animation_artifact_id: str,
    placement_records: list[dict[str, Any]],
) -> dict[str, Any]:
    next_metadata = dict(metadata)
    existing = next_metadata.get("embedded_animations")
    bindings = (
        [item for item in existing if isinstance(item, dict)]
        if isinstance(existing, list)
        else []
    )
    dedupe = {
        (
            str(item.get("animation_artifact_id") or "").strip(),
            _normalize_page_number(item.get("page_number")),
            _normalize_slot(item.get("slot")),
        ): dict(item)
        for item in bindings
    }
    for record in placement_records:
        binding_item = {
            "animation_artifact_id": animation_artifact_id,
            "page_number": _normalize_page_number(record.get("page_number")),
            "slot": _normalize_slot(record.get("slot")),
            "status": "confirmed",
            "confirmed_at": record.get("confirmed_at") or _utc_now_iso(),
        }
        dedupe[
            (
                binding_item["animation_artifact_id"],
                binding_item["page_number"],
                binding_item["slot"],
            )
        ] = binding_item
    next_metadata["embedded_animations"] = list(dedupe.values())
    return next_metadata
