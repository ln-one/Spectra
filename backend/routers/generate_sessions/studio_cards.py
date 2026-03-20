from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from routers.chat.runtime import process_chat_message
from schemas.chat import SendMessageRequest
from schemas.studio_cards import StudioCardExecutionPreviewRequest
from services.generation_session_service.card_capabilities import (
    get_studio_card_capabilities,
    get_studio_card_capability,
    get_studio_card_execution_plan,
)
from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from services.generation_session_service.card_execution_runtime import (
    execute_studio_card_initial_request,
)
from services.generation_session_service.card_source_bindings import (
    get_card_source_artifact_types,
    get_card_source_permission,
    serialize_card_source_artifact,
)
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, NotFoundException
from utils.responses import success_response

from .shared import get_session_service, get_task_queue_service

router = APIRouter()


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
    project_id = body.get("project_id")
    if not project_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="project_id 为必填字段",
        )
    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=project_id,
        config=body.get("config"),
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
    )
    if preview is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )

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
    project_id = body.get("project_id")
    if not project_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="project_id 为必填字段",
        )

    result = await execute_studio_card_initial_request(
        card_id=card_id,
        body=StudioCardExecutionPreviewRequest(
            project_id=project_id,
            config=body.get("config") or {},
            visibility=body.get("visibility"),
            source_artifact_id=body.get("source_artifact_id"),
            client_session_id=body.get("client_session_id"),
        ),
        user_id=user_id,
        session_service=get_session_service(),
        task_queue_service=get_task_queue_service(request),
    )

    return success_response(
        data={"execution_result": result.model_dump(mode="json")},
        message="Studio 卡片执行成功",
    )


@router.post("/studio-cards/{card_id}/refine")
async def refine_studio_card(
    card_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    """通过统一的 chat refine 通道执行卡片局部改写。"""
    project_id = body.get("project_id")
    message = body.get("message")
    if not project_id:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="project_id 为必填字段",
        )
    if not message:
        raise APIException(
            status_code=400,
            error_code=ErrorCode.INVALID_INPUT,
            message="message 为必填字段",
        )

    preview = build_studio_card_execution_preview(
        card_id=card_id,
        project_id=project_id,
        config=body.get("config"),
        visibility=body.get("visibility"),
        source_artifact_id=body.get("source_artifact_id"),
    )
    if preview is None:
        raise NotFoundException(
            message="Studio 卡片不存在",
            error_code=ErrorCode.NOT_FOUND,
        )
    if preview.refine_request is None:
        raise APIException(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message="该 Studio 卡片当前尚未暴露 refine 协议",
        )

    payload = preview.refine_request.payload
    chat_body = SendMessageRequest(
        project_id=project_id,
        session_id=body.get("session_id"),
        content=message,
        metadata=payload.get("metadata"),
        rag_source_ids=body.get("rag_source_ids"),
    )
    result = await process_chat_message(chat_body, user_id=user_id)
    result["data"]["card_id"] = card_id
    result["data"]["refine_request"] = preview.refine_request.model_dump(mode="json")
    result["message"] = "Studio 卡片 refine 成功"
    return result


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
    project = await project_space_service.db.get_project(project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None

    sources = []
    for artifact_type in artifact_types:
        sources.extend(
            await project_space_service.get_project_artifacts(
                project_id,
                type_filter=artifact_type,
            )
        )

    sources.sort(
        key=lambda artifact: getattr(artifact, "updatedAt", None) or "",
        reverse=True,
    )

    return success_response(
        data={
            "sources": [
                serialize_card_source_artifact(
                    artifact, current_version_id=current_version_id
                )
                for artifact in sources
            ]
        },
        message="Studio 卡片源成果获取成功",
    )
