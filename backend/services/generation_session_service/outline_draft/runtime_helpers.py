from __future__ import annotations

import json
import time

from services.generation_session_service.outline_helpers import (
    _build_outline_requirements,
    _courseware_outline_to_document,
)


def is_outline_version_unique_violation(exc: Exception) -> bool:
    text = str(exc)
    return "Unique constraint failed" in text or "UniqueViolationError" in text


async def persist_outline_version(
    *,
    db,
    session_id: str,
    outline_version: int,
    outline_doc: dict,
    change_reason: str,
) -> None:
    payload = {
        "sessionId": session_id,
        "version": outline_version,
        "outlineData": json.dumps(outline_doc),
        "changeReason": change_reason,
    }
    try:
        await db.outlineversion.create(data=payload)
        return
    except Exception as exc:
        if not is_outline_version_unique_violation(exc):
            raise
        existing = await db.outlineversion.find_first(
            where={"sessionId": session_id, "version": outline_version},
            order={"createdAt": "desc"},
        )
        if not existing:
            raise
        await db.outlineversion.update(
            where={"id": existing.id},
            data={
                "outlineData": payload["outlineData"],
                "changeReason": payload["changeReason"],
            },
        )


async def build_session_conversation_requirements(
    *, db, project_id: str, session_id: str
) -> str:
    project = await db.project.find_unique(where={"id": project_id})
    if not project:
        return "生成课件大纲"

    project_name = getattr(project, "name", None)
    project_description = getattr(project, "description", None)

    conversation_model = getattr(db, "conversation", None)
    if conversation_model is None:
        messages = []
    else:
        messages = await conversation_model.find_many(
            where={"projectId": project_id, "sessionId": session_id},
            take=10,
            order={"createdAt": "desc"},
        )
    user_messages = [
        msg
        for msg in reversed(messages)
        if getattr(msg, "role", None) == "user"
        or (isinstance(msg, dict) and msg.get("role") == "user")
    ]

    requirement_parts = []
    if project_name:
        requirement_parts.append(f"项目名称：{project_name}")
    if project_description:
        requirement_parts.append(f"项目描述：{project_description}")
    if user_messages:
        requirement_parts.append("\n当前会话用户需求：")
        for msg in user_messages[-3:]:
            content = (
                msg.get("content")
                if isinstance(msg, dict)
                else getattr(msg, "content", None)
            )
            if content:
                requirement_parts.append(f"- {content}")
    return "\n".join(requirement_parts) if requirement_parts else "生成课件大纲"


async def generate_outline_doc(
    *,
    db,
    session_id: str,
    project_id: str,
    options,
    ai_service_obj,
):
    requirements_started_at = time.perf_counter()
    project = await db.project.find_unique(where={"id": project_id})
    conversation_requirements = await build_session_conversation_requirements(
        db=db,
        project_id=project_id,
        session_id=session_id,
    )
    outline_requirements = _build_outline_requirements(project, options)
    requirements_build_ms = round(
        (time.perf_counter() - requirements_started_at) * 1000,
        2,
    )
    requirement_text = "\n\n".join(
        part.strip()
        for part in [conversation_requirements, outline_requirements]
        if part and part.strip()
    )
    template_style = (options or {}).get("template") or "default"
    llm_started_at = time.perf_counter()
    outline = await ai_service_obj.generate_outline(
        project_id=project_id,
        user_requirements=requirement_text,
        template_style=template_style,
        session_id=session_id,
        rag_source_ids=(options or {}).get("rag_source_ids"),
    )
    outline_doc = _courseware_outline_to_document(
        outline,
        target_pages=(options or {}).get("pages"),
    )
    outline_doc["_requirements_build_ms"] = requirements_build_ms
    outline_doc["_rag_context_ms"] = 0.0
    outline_doc["_outline_llm_ms"] = round(
        (time.perf_counter() - llm_started_at) * 1000,
        2,
    )
    return outline_doc
