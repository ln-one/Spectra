from __future__ import annotations

from typing import Awaitable, Callable, Optional
from uuid import UUID

PreviewAnchorResolver = Callable[
    [str, dict, Optional[str], Optional[str]], Awaitable[dict]
]
PreviewMaterialLoader = Callable[
    [str, str, Optional[str], Optional[str], Optional[str]], Awaitable[tuple]
]
SessionSnapshotLoader = Callable[[str, str], Awaitable[dict]]
CandidateChangeAttacher = Callable[..., Awaitable[Optional[dict]]]


async def load_preview_material_for_snapshot(
    *,
    session_id: str,
    snapshot: dict,
    artifact_id: Optional[str],
    run_id: Optional[str],
    resolve_preview_anchor: PreviewAnchorResolver,
    load_preview_material: PreviewMaterialLoader,
) -> tuple[dict, object, list, object, dict]:
    anchor = await resolve_preview_anchor(session_id, snapshot, artifact_id, run_id)
    project_id = snapshot["session"]["project_id"]
    task_id = snapshot["session"].get("task_id")
    resolved_run_id = anchor.get("run_id") or (
        (snapshot.get("current_run") or {}).get("run_id")
        if isinstance(snapshot.get("current_run"), dict)
        else None
    )
    material_context, slides, lesson_plan, content = await load_preview_material(
        session_id,
        project_id,
        anchor.get("artifact_id"),
        task_id,
        resolved_run_id,
    )
    return anchor, material_context, slides, lesson_plan, content


async def attach_candidate_change_if_needed(
    *,
    session_id: str,
    user_id: str,
    snapshot: dict,
    body: dict,
    parsed_idempotency_key: Optional[UUID],
    cache_scope: str,
    generation_command: dict,
    generation_result,
    trigger: str,
    payload: dict,
    attach_auto_candidate_change: CandidateChangeAttacher,
) -> dict:
    candidate_change = await attach_auto_candidate_change(
        session_id=session_id,
        user_id=user_id,
        snapshot=snapshot,
        body=body,
        candidate_change_body=body.get("candidate_change"),
        idempotency_key=parsed_idempotency_key,
        cache_scope=cache_scope,
        generation_command=generation_command,
        generation_result=generation_result,
        trigger=trigger,
    )
    if candidate_change is not None:
        payload["candidate_change"] = candidate_change
    return payload
