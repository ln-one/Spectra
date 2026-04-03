from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.ai import ai_service
from services.ai.model_router import ModelRouteTask
from services.prompt_service import build_prompt_traceability

logger = logging.getLogger(__name__)

SESSION_TITLE_SOURCE_DEFAULT = "default"
SESSION_TITLE_SOURCE_FIRST_MESSAGE = "first_message"
SESSION_TITLE_SOURCE_MANUAL = "manual"

RUN_TITLE_SOURCE_PENDING = "pending"
RUN_TITLE_SOURCE_AUTO = "auto"
RUN_TITLE_SOURCE_MANUAL = "manual"
RUN_TITLE_SOURCE_FALLBACK = "fallback"

RUN_STATUS_PENDING = "pending"
RUN_STATUS_PROCESSING = "processing"
RUN_STATUS_COMPLETED = "completed"
RUN_STATUS_FAILED = "failed"

RUN_STEP_CONFIG = "config"
RUN_STEP_OUTLINE = "outline"
RUN_STEP_GENERATE = "generate"
RUN_STEP_PREVIEW = "preview"
RUN_STEP_MODIFY_SLIDE = "modify_slide"
RUN_STEP_COMPLETED = "completed"

_RUN_TOOL_LABELS = {
    "ppt_generate": "PPT生成",
    "word_generate": "Word生成",
    "both_generate": "课件生成",
    "outline_redraft": "大纲重写",
    "slide_modify": "单页修改",
}

_STUDIO_CARD_LABELS = {
    "courseware_ppt": "课件生成",
    "word_document": "讲义文档",
    "interactive_quick_quiz": "随堂小测",
    "interactive_games": "互动游戏",
    "classroom_qa_simulator": "课堂问答模拟",
    "speaker_notes": "讲稿备注",
    "knowledge_mindmap": "知识导图",
    "demonstration_animations": "演示动画",
}


def _supports_session_run(db: Any) -> bool:
    return hasattr(db, "sessionrun")


def build_default_session_title(session_id: Optional[str] = None) -> str:
    if session_id:
        return f"会话-{str(session_id)[-6:]}"
    return "新建会话"


def build_numbered_default_session_title(sequence_no: int) -> str:
    normalized = max(1, int(sequence_no or 1))
    return f"新建会话{normalized}"


def build_run_scope_key(*, session_id: Optional[str], project_id: str) -> str:
    return f"session:{session_id}" if session_id else f"project:{project_id}"


def resolve_tool_label(tool_type: str) -> str:
    normalized = str(tool_type or "").strip()
    if normalized.startswith("studio_card:"):
        card_id = normalized.split(":", 1)[1]
        return _STUDIO_CARD_LABELS.get(card_id, card_id)
    return _RUN_TOOL_LABELS.get(normalized, normalized)


def build_pending_run_title(run_no: int, tool_type: str) -> str:
    return f"第{run_no}次{resolve_tool_label(tool_type)}"


def serialize_session_run(run: Any | None) -> Optional[dict]:
    if not run:
        return None
    return {
        "run_id": getattr(run, "id", None),
        "session_id": getattr(run, "sessionId", None),
        "project_id": getattr(run, "projectId", None),
        "tool_type": getattr(run, "toolType", None),
        "run_no": getattr(run, "runNo", None),
        "run_title": getattr(run, "title", None),
        "run_title_source": getattr(run, "titleSource", None),
        "run_title_updated_at": (
            getattr(run, "titleUpdatedAt").isoformat()
            if getattr(run, "titleUpdatedAt", None)
            else None
        ),
        "run_status": getattr(run, "status", None),
        "run_step": getattr(run, "step", None),
        "artifact_id": getattr(run, "artifactId", None),
        "created_at": (
            run.createdAt.isoformat() if getattr(run, "createdAt", None) else None
        ),
        "updated_at": (
            run.updatedAt.isoformat() if getattr(run, "updatedAt", None) else None
        ),
    }


def build_run_trace_payload(run: Any | dict | None, **extra: Any) -> dict:
    payload: dict[str, Any] = {}
    if run:
        run_payload = run if isinstance(run, dict) else serialize_session_run(run)
        if run_payload:
            payload.update(run_payload)
    payload.update({key: value for key, value in extra.items() if value is not None})
    return payload


def build_run_prompt_trace_payload(*, rag_source_ids: list[str] | None = None) -> dict:
    return build_prompt_traceability(rag_source_ids=rag_source_ids)


async def get_latest_session_run(db, session_id: str) -> Any | None:
    if not _supports_session_run(db):
        return None
    try:
        return await db.sessionrun.find_first(
            where={"sessionId": session_id},
            order={"createdAt": "desc"},
        )
    except Exception as exc:
        logger.warning("Skip session run lookup: session=%s error=%s", session_id, exc)
        return None


async def create_session_run(
    *,
    db,
    session_id: Optional[str],
    project_id: str,
    tool_type: str,
    step: str,
    status: str = RUN_STATUS_PROCESSING,
    title_source: str = RUN_TITLE_SOURCE_PENDING,
    artifact_id: Optional[str] = None,
) -> Any:
    if not _supports_session_run(db):
        return None
    scope_key = build_run_scope_key(session_id=session_id, project_id=project_id)

    last_error: Exception | None = None
    for _ in range(3):
        try:
            run_no = (
                await db.sessionrun.count(
                    where={
                        "runScopeKey": scope_key,
                        "toolType": tool_type,
                    }
                )
                + 1
            )
        except Exception as exc:
            logger.warning(
                (
                    "Skip session run create before storage is ready: "
                    "project=%s session=%s tool=%s error=%s"
                ),
                project_id,
                session_id,
                tool_type,
                exc,
            )
            return None
        title = build_pending_run_title(run_no, tool_type)
        try:
            return await db.sessionrun.create(
                data={
                    "runScopeKey": scope_key,
                    "sessionId": session_id,
                    "projectId": project_id,
                    "toolType": tool_type,
                    "runNo": run_no,
                    "title": title,
                    "titleSource": title_source,
                    "status": status,
                    "step": step,
                    "artifactId": artifact_id,
                }
            )
        except Exception as exc:  # pragma: no cover - depends on db collision timing
            last_error = exc
            if "runScopeKey" not in str(exc) and "Unique" not in str(exc):
                raise
            logger.warning(
                "Retrying SessionRun create after uniqueness conflict: %s", exc
            )
    if last_error:
        raise last_error
    raise RuntimeError("Failed to create session run")


async def update_session_run(
    *,
    db,
    run_id: str,
    title: Optional[str] = None,
    title_source: Optional[str] = None,
    status: Optional[str] = None,
    step: Optional[str] = None,
    artifact_id: Optional[str] = None,
) -> Any:
    if not _supports_session_run(db):
        return None
    data: dict[str, Any] = {}
    if title is not None:
        data["title"] = title
        data["titleUpdatedAt"] = datetime.now(timezone.utc)
    if title_source is not None:
        data["titleSource"] = title_source
        if title is None:
            data["titleUpdatedAt"] = datetime.now(timezone.utc)
    if status is not None:
        data["status"] = status
    if step is not None:
        data["step"] = step
    if artifact_id is not None:
        data["artifactId"] = artifact_id
    if not data:
        try:
            return await db.sessionrun.find_unique(where={"id": run_id})
        except Exception as exc:
            logger.warning("Skip session run read: run=%s error=%s", run_id, exc)
            return None
    try:
        return await db.sessionrun.update(where={"id": run_id}, data=data)
    except Exception as exc:
        logger.warning("Skip session run update: run=%s error=%s", run_id, exc)
        return None


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


def _parse_artifact_metadata(raw_metadata: Any) -> dict:
    if isinstance(raw_metadata, dict):
        return dict(raw_metadata)
    if isinstance(raw_metadata, str):
        try:
            parsed = json.loads(raw_metadata)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def _sync_run_title_to_artifact_metadata(*, db, run: Any | None) -> None:
    if run is None:
        return
    artifact_id = getattr(run, "artifactId", None)
    run_title = str(getattr(run, "title", "") or "").strip()
    if not artifact_id or not run_title:
        return
    artifact_model = getattr(db, "artifact", None)
    if artifact_model is None:
        return
    if not hasattr(artifact_model, "find_unique") or not hasattr(
        artifact_model, "update"
    ):
        return

    try:
        artifact = await artifact_model.find_unique(where={"id": artifact_id})
        if not artifact:
            return
        metadata = _parse_artifact_metadata(getattr(artifact, "metadata", None))
        title_source = str(getattr(run, "titleSource", "") or "").strip()
        metadata["run_title"] = run_title
        if title_source:
            metadata["run_title_source"] = title_source
        if title_source in {RUN_TITLE_SOURCE_AUTO, RUN_TITLE_SOURCE_MANUAL}:
            metadata["title"] = run_title
        await artifact_model.update(
            where={"id": artifact_id},
            data={"metadata": json.dumps(metadata, ensure_ascii=False)},
        )
    except Exception as exc:
        logger.warning(
            "Sync run title to artifact metadata failed: run=%s artifact=%s error=%s",
            getattr(run, "id", None),
            artifact_id,
            exc,
        )


async def generate_semantic_run_title(
    *,
    db,
    run_id: str,
    tool_type: str,
    snapshot: Any = None,
) -> Optional[dict]:
    if not _supports_session_run(db):
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
            await _sync_run_title_to_artifact_metadata(db=db, run=updated)
            return serialize_session_run(updated)
        updated = await update_session_run(
            db=db,
            run_id=run_id,
            title=title[:120],
            title_source=RUN_TITLE_SOURCE_AUTO,
        )
        await _sync_run_title_to_artifact_metadata(db=db, run=updated)
        return serialize_session_run(updated)
    except Exception as exc:
        logger.warning("Auto run title generation failed: run=%s error=%s", run_id, exc)
        updated = await update_session_run(
            db=db,
            run_id=run_id,
            title_source=RUN_TITLE_SOURCE_FALLBACK,
        )
        await _sync_run_title_to_artifact_metadata(db=db, run=updated)
        return serialize_session_run(updated)


def spawn_background_task(coro, *, label: str) -> None:
    try:
        task = asyncio.create_task(coro)
    except RuntimeError:
        if asyncio.iscoroutine(coro):
            coro.close()
        logger.warning("Skip background task without running loop: %s", label)
        return

    def _consume_result(completed: asyncio.Task) -> None:
        try:
            completed.result()
        except Exception as exc:  # pragma: no cover - detached logging path
            logger.warning(
                "Background task failed: %s error=%s", label, exc, exc_info=True
            )

    task.add_done_callback(_consume_result)
