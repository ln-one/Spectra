from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from routers.generate_sessions.shared import (
    CONTRACT_VERSION,
    get_session_service,
    get_task_queue_service,
)
from schemas.studio_cards import StudioCardExecutionPreviewRequest
from services.generation_session_service import _default_capabilities
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
from services.platform.state_transition_guard import (
    VALID_COMMANDS,
    VALID_STATES,
    GenerationState,
    state_transition_guard,
)
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, NotFoundException
from utils.responses import success_response

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


@router.get("/capabilities")
async def get_capabilities(
    user_id: str = Depends(get_current_user),
):
    """返回服务端当前支持的契约版本、特性开关与弃用信息。"""
    transitions = state_transition_guard.get_transitions()

    return success_response(
        data={
            "contract_versions": [CONTRACT_VERSION],
            "default_contract_version": CONTRACT_VERSION,
            "command_interface": {
                "endpoint": "/api/v1/generate/sessions/{session_id}/commands",
                "supported_commands": sorted(VALID_COMMANDS),
            },
            "capabilities": _default_capabilities(),
            "studio_cards": get_studio_card_capabilities(),
            "state_machine": {
                "states": sorted(VALID_STATES),
                "terminal_states": [
                    GenerationState.SUCCESS.value,
                    GenerationState.FAILED.value,
                ],
                "transitions": transitions,
            },
            "deprecations": [
                {
                    "api": ep,
                    "sunset_at": "2026-06-01T00:00:00Z",
                    "replacement": "/api/v1/generate/sessions/{session_id}/commands",
                }
                for ep in [
                    "/api/v1/generate/sessions/{session_id}/outline",
                    "/api/v1/generate/sessions/{session_id}/confirm",
                    "/api/v1/generate/sessions/{session_id}/outline/redraft",
                    "/api/v1/generate/sessions/{session_id}/resume",
                    (
                        "/api/v1/generate/sessions/{session_id}/slides/"
                        "{slide_id}/regenerate"
                    ),
                ]
            ],
        },
        message="能力声明获取成功",
    )
