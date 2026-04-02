from __future__ import annotations

from typing import Any

from utils.exceptions import ValidationException

_RELATION_TYPES = {"base", "auxiliary"}
_MODES = {"follow", "pinned"}


async def apply_public_library_inputs(
    *,
    db,
    project_id: str,
    user_id: str,
    options: dict | None,
) -> dict | None:
    if not isinstance(options, dict):
        return options
    raw_inputs = options.get("public_library_inputs")
    if raw_inputs is None:
        return options
    if not isinstance(raw_inputs, list):
        raise ValidationException("options.public_library_inputs must be a list")

    normalized_inputs = await _normalize_public_library_inputs(
        db=db,
        project_id=project_id,
        user_id=user_id,
        raw_inputs=raw_inputs,
    )
    if not normalized_inputs:
        return options

    await _sync_project_references(
        db=db,
        project_id=project_id,
        user_id=user_id,
        normalized_inputs=normalized_inputs,
    )
    return options


async def _normalize_public_library_inputs(
    *,
    db,
    project_id: str,
    user_id: str,
    raw_inputs: list[Any],
) -> list[dict]:
    normalized: list[dict] = []
    base_count = 0
    for index, item in enumerate(raw_inputs):
        if not isinstance(item, dict):
            raise ValidationException("public_library_inputs item must be an object")
        target_project_id = str(item.get("project_id") or "").strip()
        if not target_project_id:
            raise ValidationException("public_library_inputs.project_id is required")
        if target_project_id == project_id:
            raise ValidationException(
                "public library project_id cannot be self project"
            )

        relation_type = str(item.get("relation_type") or "auxiliary").strip().lower()
        if relation_type not in _RELATION_TYPES:
            raise ValidationException("relation_type must be base or auxiliary")
        if relation_type == "base":
            base_count += 1

        mode = str(item.get("mode") or "follow").strip().lower()
        if mode not in _MODES:
            raise ValidationException("mode must be follow or pinned")

        target_project = await db.project.find_unique(where={"id": target_project_id})
        if not target_project:
            raise ValidationException(
                f"public library project not found: {target_project_id}"
            )
        owner_user_id = str(getattr(target_project, "userId", "") or "")
        visibility = str(getattr(target_project, "visibility", "") or "").lower()
        is_referenceable = bool(getattr(target_project, "isReferenceable", False))
        is_shared_referenceable = visibility == "shared" and is_referenceable
        if owner_user_id != user_id and not is_shared_referenceable:
            raise ValidationException(
                f"project {target_project_id} is not referenceable shared library"
            )

        pinned_version_id = str(item.get("pinned_version_id") or "").strip() or None
        if mode == "pinned" and not pinned_version_id:
            pinned_version_id = (
                str(getattr(target_project, "currentVersionId", "") or "").strip()
                or None
            )
        if mode == "pinned" and not pinned_version_id:
            raise ValidationException(
                f"mode=pinned requires pinned_version_id for {target_project_id}"
            )

        normalized.append(
            {
                "project_id": target_project_id,
                "relation_type": relation_type,
                "mode": mode,
                "pinned_version_id": pinned_version_id,
                "priority": index,
            }
        )

    if base_count > 1:
        raise ValidationException("only one base public library is allowed")
    return normalized


async def _sync_project_references(
    *,
    db,
    project_id: str,
    user_id: str,
    normalized_inputs: list[dict],
) -> None:
    existing_refs = await db.projectreference.find_many(where={"projectId": project_id})
    by_target: dict[str, Any] = {}
    for reference in existing_refs or []:
        target_id = str(getattr(reference, "targetProjectId", "") or "").strip()
        if not target_id or target_id in by_target:
            continue
        by_target[target_id] = reference

    selected_base_target = next(
        (
            item["project_id"]
            for item in normalized_inputs
            if item["relation_type"] == "base"
        ),
        None,
    )
    if selected_base_target:
        for reference in existing_refs or []:
            if (
                str(getattr(reference, "relationType", "") or "").lower() == "base"
                and str(getattr(reference, "status", "") or "").lower() == "active"
                and str(getattr(reference, "targetProjectId", "") or "").strip()
                != selected_base_target
            ):
                await db.projectreference.update(
                    where={"id": reference.id},
                    data={"status": "disabled"},
                )

    for item in normalized_inputs:
        target_project_id = item["project_id"]
        payload = {
            "relationType": item["relation_type"],
            "mode": item["mode"],
            "priority": item["priority"],
            "status": "active",
            "pinnedVersionId": item["pinned_version_id"],
        }
        existing = by_target.get(target_project_id)
        if existing:
            await db.projectreference.update(
                where={"id": existing.id},
                data=payload,
            )
            continue
        await db.projectreference.create(
            data={
                "projectId": project_id,
                "targetProjectId": target_project_id,
                "relationType": item["relation_type"],
                "mode": item["mode"],
                "pinnedVersionId": item["pinned_version_id"],
                "priority": item["priority"],
                "status": "active",
                "createdBy": user_id,
            }
        )
