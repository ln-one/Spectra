from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.generation_session_service.run_artifact_sync import (
    sync_run_title_to_artifact_metadata,
)
from services.generation_session_service.run_constants import (
    RUN_TITLE_SOURCE_AUTO,
    RUN_TITLE_SOURCE_FALLBACK,
    RUN_TITLE_SOURCE_PENDING,
    SESSION_TITLE_SOURCE_DEFAULT,
    SESSION_TITLE_SOURCE_FIRST_MESSAGE,
    resolve_tool_label,
)
from services.generation_session_service.run_lifecycle import (
    supports_session_run,
    update_session_run,
)
from services.generation_session_service.run_serialization import serialize_session_run

logger = logging.getLogger(__name__)


async def generate_semantic_session_title(
    *,
    db,
    session_id: str,
    first_message: str,
) -> Optional[dict]:
    session = await db.generationsession.find_unique(where={"id": session_id})
    if not session:
        return None
    if (
        getattr(session, "displayTitleSource", SESSION_TITLE_SOURCE_DEFAULT)
        != SESSION_TITLE_SOURCE_DEFAULT
    ):
        return None

    prompt = (
        "请根据用户的第一条教学需求，为会话生成一个简短、明确、自然的中文标题。"
        "要求：不超过18个字，不加引号，不加句号，不解释。\n"
        f"用户消息：{first_message.strip()}"
    )
    try:
        result = await ai_service.generate(
            prompt,
            route_task=ModelRouteTask.TITLE_POLISH.value,
            max_tokens=40,
        )
        title = str((result or {}).get("content") or "").strip()
        if not title:
            return None
        updated = await db.generationsession.update(
            where={"id": session_id},
            data={
                "displayTitle": title[:120],
                "displayTitleSource": SESSION_TITLE_SOURCE_FIRST_MESSAGE,
                "displayTitleUpdatedAt": datetime.now(timezone.utc),
            },
        )
        return {
            "display_title": updated.displayTitle,
            "display_title_source": updated.displayTitleSource,
            "display_title_updated_at": (
                updated.displayTitleUpdatedAt.isoformat()
                if updated.displayTitleUpdatedAt
                else None
            ),
        }
    except Exception as exc:
        logger.warning(
            "Auto session title generation failed: session=%s error=%s", session_id, exc
        )
        return None


def _stringify_snapshot(snapshot: Any) -> str:
    if snapshot is None:
        return ""
    if isinstance(snapshot, str):
        return snapshot
    try:
        return json.dumps(snapshot, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(snapshot)


async def generate_semantic_run_title(
    *,
    db,
    run_id: str,
    tool_type: str,
    snapshot: Any = None,
) -> Optional[dict]:
    if not supports_session_run(db):
        return None
    try:
        run = await db.sessionrun.find_unique(where={"id": run_id})
    except Exception as exc:
        logger.warning(
            "Skip semantic run title generation lookup: run=%s error=%s", run_id, exc
        )
        return None
    if not run:
        return None
    if getattr(run, "titleSource", RUN_TITLE_SOURCE_PENDING) not in {
        RUN_TITLE_SOURCE_PENDING,
        RUN_TITLE_SOURCE_FALLBACK,
    }:
        return None

    prompt = (
        "请为一次教学工具执行生成一个简短中文标题。"
        "要求：不超过18个字，不加引号，不加句号，尽量体现动作或主题。\n"
        f"工具：{resolve_tool_label(tool_type)}\n"
        f"上下文：{_stringify_snapshot(snapshot)}"
    )
    try:
        result = await ai_service.generate(
            prompt,
            route_task=ModelRouteTask.TITLE_POLISH.value,
            max_tokens=40,
        )
        title = str((result or {}).get("content") or "").strip()
        if not title:
            updated = await update_session_run(
                db=db,
                run_id=run_id,
                title_source=RUN_TITLE_SOURCE_FALLBACK,
            )
            await sync_run_title_to_artifact_metadata(db=db, run=updated)
            return serialize_session_run(updated)
        updated = await update_session_run(
            db=db,
            run_id=run_id,
            title=title[:120],
            title_source=RUN_TITLE_SOURCE_AUTO,
        )
        await sync_run_title_to_artifact_metadata(db=db, run=updated)
        return serialize_session_run(updated)
    except Exception as exc:
        logger.warning("Auto run title generation failed: run=%s error=%s", run_id, exc)
        updated = await update_session_run(
            db=db,
            run_id=run_id,
            title_source=RUN_TITLE_SOURCE_FALLBACK,
        )
        await sync_run_title_to_artifact_metadata(db=db, run=updated)
        return serialize_session_run(updated)
