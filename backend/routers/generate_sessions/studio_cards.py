from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from schemas.studio_cards import RefineMode

from routers.chat.runtime import process_chat_message
from services.generation_session_service.card_capabilities import (
    get_studio_card_capabilities,
    get_studio_card_capability,
    get_studio_card_execution_plan,
)
from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from services.generation_session_service.card_execution_runtime import (
    execute_classroom_simulator_turn,
    execute_studio_card_draft_request,
    execute_studio_card_initial_request,
    execute_studio_card_refine_request,
    supports_structured_refine,
)
from services.generation_session_service.card_source_bindings import (
    build_source_binding_candidate_payload,
    get_card_source_artifact_types,
    get_card_source_permission,
    serialize_card_source_artifact,
)
from services.project_space_service.service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, NotFoundException
from utils.responses import success_response

from .shared import get_session_service, get_task_queue_service
from .studio_card_route_support import (
    _resolve_request_rag_source_ids,
    build_chat_refine_request,
    build_execution_request,
    build_refine_request,
    build_turn_request,
    require_body_field,
    require_project_id,
)

router = APIRouter()


def _build_preview_or_raise(card_id: str, body: dict):
    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=body.get("project_id"),
        config=body.get("config"),
        template_config=body.get("template_config"),
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
        rag_source_ids=_resolve_request_rag_source_ids(body),
    )
    if preview is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )
    return preview


@router.get("/studio-cards")
async def get_studio_cards(
    user_id: str = Depends(get_current_user),
):
    """返回 Studio 卡片目录与当前卡片级协议成熟度。"""
    return success_response(
        data={"studio_cards": get_studio_card_capabilities()},
        message="Studio 卡片目录获取成功",
    )


@router.get("/studio-cards/{card_id}")
async def get_studio_card(
    card_id: str,
    user_id: str = Depends(get_current_user),
):
    """返回单张 Studio 卡片的协议细节。"""
    card = get_studio_card_capability(card_id)
    if card is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )

    return success_response(
        data={"studio_card": card},
        message="Studio 卡片详情获取成功",
    )


@router.get("/studio-cards/{card_id}/execution-plan")
async def get_studio_card_execution_plan_detail(
    card_id: str,
    user_id: str = Depends(get_current_user),
):
    """返回单张 Studio 卡片当前可落地的后端执行协议。"""
    plan = get_studio_card_execution_plan(card_id)
    if plan is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )

    return success_response(
        data={"execution_plan": plan},
        message="Studio 卡片执行协议获取成功",
    )


@router.post("/studio-cards/{card_id}/execution-preview")
async def preview_studio_card_execution(
    card_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """根据卡片配置返回当前可直接调用的后端请求预览。"""
    body = {**body, "project_id": require_project_id(body)}
    preview = _build_preview_or_raise(card_id, body)

    return success_response(
        data={"execution_preview": preview.model_dump(mode="json")},
        message="Studio 卡片执行预览获取成功",
    )


@router.post("/studio-cards/{card_id}/execute")
async def execute_studio_card(
    card_id: str,
    body: dict,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    """执行已达到 foundation-ready 的 Studio 卡片初始动作。"""
    project_id = require_project_id(body)

    result = await execute_studio_card_initial_request(
        card_id=card_id,
        body=build_execution_request(project_id=project_id, body=body),
        user_id=user_id,
        session_service=get_session_service(),
        task_queue_service=get_task_queue_service(request),
    )

    return success_response(
        data={"execution_result": result.model_dump(mode="json")},
        message="Studio 卡片执行成功",
    )


@router.post("/studio-cards/{card_id}/draft")
async def draft_studio_card(
    card_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """为 Studio 卡片创建草稿 run（不触发最终生成）。"""
    project_id = require_project_id(body)
    result = await execute_studio_card_draft_request(
        card_id=card_id,
        body=build_execution_request(project_id=project_id, body=body),
        user_id=user_id,
        session_service=get_session_service(),
    )
    return success_response(
        data={"execution_result": result.model_dump(mode="json")},
        message="Studio 卡片草稿已创建",
    )


@router.post("/studio-cards/{card_id}/refine")
async def refine_studio_card(
    card_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """执行卡片 refine；结构化更新优先，chat 作为兼容后备路径。"""
    project_id = require_project_id(body)
    refine_body = build_refine_request(project_id=project_id, body=body)

    if (
        supports_structured_refine(card_id)
        and refine_body.artifact_id
        and refine_body.refine_mode != RefineMode.CHAT_REFINE
    ):
        result = await execute_studio_card_refine_request(
            card_id=card_id,
            body=refine_body,
            user_id=user_id,
        )
        return success_response(
            data={"execution_result": result.model_dump(mode="json")},
            message="Studio 卡片 refine 成功",
        )

    if not refine_body.message:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="message 为必填字段",
        )

    body = {**body, "project_id": project_id}
    preview = _build_preview_or_raise(card_id, body)
    if preview.refine_request is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="该 Studio 卡片当前尚未暴露 refine 协议",
        )

    payload = preview.refine_request.payload
    chat_body = build_chat_refine_request(
        card_id=card_id,
        project_id=project_id,
        body=body,
        payload=payload,
    )
    result = await process_chat_message(chat_body, user_id=user_id)
    result["data"]["card_id"] = card_id
    result["data"]["refine_request"] = preview.refine_request.model_dump(mode="json")
    result["message"] = "Studio 卡片 refine 成功"
    return result


@router.post("/studio-cards/classroom_qa_simulator/turn")
async def advance_classroom_simulator_turn(
    body: dict,
    user_id: str = Depends(get_current_user),
):
    project_id = require_project_id(body)
    artifact_id = require_body_field(
        body,
        "artifact_id",
        message="artifact_id 为必填字段",
    )
    teacher_answer = require_body_field(
        body,
        "teacher_answer",
        message="teacher_answer 为必填字段",
    )

    artifact_payload, turn_result, latest_runnable_state = await execute_classroom_simulator_turn(
        body=build_turn_request(
            project_id=project_id,
            artifact_id=artifact_id,
            teacher_answer=teacher_answer,
            body=body,
        ),
        user_id=user_id,
    )
    return success_response(
        data={
            "artifact": artifact_payload,
            "turn_result": turn_result.model_dump(mode="json"),
            "latest_runnable_state": latest_runnable_state,
        },
        message="课堂问答模拟推进成功",
    )


@router.get("/studio-cards/{card_id}/sources")
async def get_studio_card_sources(
    card_id: str,
    project_id: str = Query(..., description="项目 ID"),
    user_id: str = Depends(get_current_user),
):
    """返回 Studio 卡片当前可绑定的源成果列表。"""
    artifact_types = get_card_source_artifact_types(card_id)
    if not artifact_types:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="该 Studio 卡片当前不需要单独绑定源成果",
        )

    await project_space_service.check_project_permission(
        project_id, user_id, get_card_source_permission(card_id)
    )
    sources = []
    for artifact_type in artifact_types:
        sources.extend(
            await project_space_service.get_project_artifacts(
                project_id,
                type_filter=artifact_type,
            )
        )

    def _source_sort_key(artifact):
        metadata = getattr(artifact, "metadata", None)
        updated_at = getattr(artifact, "updatedAt", None)
        superseded_by_artifact_id = None
        if isinstance(metadata, dict):
            superseded_by_artifact_id = metadata.get("superseded_by_artifact_id")
        return (bool(superseded_by_artifact_id), updated_at)

    sources.sort(key=_source_sort_key)
    serialized_sources = [
        serialize_card_source_artifact(artifact) for artifact in sources
    ]

    return success_response(
        data={
            "sources": serialized_sources,
            "source_binding_candidates": build_source_binding_candidate_payload(
                card_id=card_id,
                sources=serialized_sources,
            ),
        },
        message="Studio 卡片源成果获取成功",
    )
