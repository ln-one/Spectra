from __future__ import annotations

from types import SimpleNamespace

from services.preview_helpers import load_preview_content, save_preview_content
from services.preview_helpers.material_lookup import resolve_preview_material_context


async def load_session_preview_material_context(db, session) -> dict:
    context = await resolve_preview_material_context(
        SimpleNamespace(db=db),
        session.id,
        artifact_id=None,
        run_id=None,
    )
    if context is not None:
        return context
    return {
        "render_job_id": f"session-{session.id}",
        "artifact_id": None,
        "run_id": None,
        "artifact_metadata": {},
    }


async def load_preview_content_for_context(material_context: dict | None) -> dict | None:
    if not isinstance(material_context, dict):
        return None
    render_job_id = str(material_context.get("render_job_id") or "").strip()
    if not render_job_id:
        return None
    cached = await load_preview_content(render_job_id)
    return cached if isinstance(cached, dict) else None


async def persist_preview_content_for_context(
    db,
    material_context: dict | None,
    preview_payload: dict,
) -> None:
    del db
    if not isinstance(material_context, dict):
        return
    render_job_id = str(material_context.get("render_job_id") or "").strip()
    if render_job_id:
        await save_preview_content(render_job_id, preview_payload)
