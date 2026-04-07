from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from routers.chat.runtime import process_chat_message
from routers.project_space.shared import to_artifact_model
from schemas.project_space import ProjectPermission
from schemas.studio_cards import (
    AnimationPlacementConfirmRequest,
    AnimationPlacementRecommendationRequest,
)
from services.generation_session_service.animation_workflow import (
    apply_animation_placement_update,
    artifact_metadata_dict,
    build_animation_placement_recommendation,
    build_animation_placement_records,
    require_animation_artifact,
    require_ppt_artifact,
)
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
    get_card_source_artifact_types,
    get_card_source_permission,
    serialize_card_source_artifact,
)
from services.project_space_service import project_space_service
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
async def get_studio_cards(user_id: str = Depends(get_current_user)):
    return success_response(
        data={"studio_cards": get_studio_card_capabilities()},
        message="Studio 卡片目录获取成功",
    )


@router.get("/studio-cards/{card_id}")
async def get_studio_card(
    card_id: str,
    user_id: str = Depends(get_current_user),
):
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
    project_id = require_project_id(body)
    result = await execute_studio_card_draft_request(
        card_id=card_id,
        body=build_execution_request(project_id=project_id, body=body),
        user_id=user_id,
        session_service=get_session_service(),
    )
    return success_response(
        data={"execution_result": result.model_dump(mode="json")},
        message="Studio 卡片草稿创建成功",
    )


@router.post("/studio-cards/{card_id}/refine")
async def refine_studio_card(
    card_id: str,
    body: dict,
    user_id: str = Depends(get_current_user),
):
    project_id = require_project_id(body)
    refine_body = build_refine_request(project_id=project_id, body=body)

    if supports_structured_refine(card_id) and refine_body.artifact_id:
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
            message="该 Studio 卡片当前未暴露 refine 协议",
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

    artifact_payload, turn_result = await execute_classroom_simulator_turn(
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
        },
        message="课堂问答模拟推进成功",
    )


@router.get("/studio-cards/{card_id}/sources")
async def get_studio_card_sources(
    card_id: str,
    project_id: str = Query(..., description="Project ID"),
    user_id: str = Depends(get_current_user),
):
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

    def _source_sort_key(artifact):
        metadata = getattr(artifact, "metadata", None)
        is_current = True
        if isinstance(metadata, dict):
            is_current = bool(metadata.get("is_current", True))
        updated_at = getattr(artifact, "updatedAt", None)
        return (not is_current, updated_at)

    sources.sort(key=_source_sort_key)

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


@router.post("/studio-cards/demonstration_animations/recommend-placement")
async def recommend_animation_placement(
    body: AnimationPlacementRecommendationRequest,
    user_id: str = Depends(get_current_user),
):
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    animation_artifact = await require_animation_artifact(
        body.project_id,
        body.artifact_id,
    )
    ppt_artifact = await require_ppt_artifact(
        body.project_id,
        body.ppt_artifact_id,
    )
    recommendation = build_animation_placement_recommendation(
        animation_artifact=animation_artifact,
        ppt_artifact=ppt_artifact,
    )
    metadata = apply_animation_placement_update(
        metadata=artifact_metadata_dict(animation_artifact),
        recommendation=recommendation,
    )
    if hasattr(project_space_service.db, "update_artifact_metadata"):
        await project_space_service.db.update_artifact_metadata(
            body.artifact_id,
            metadata,
        )

    project = await project_space_service.db.get_project(body.project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None
    updated_artifact = await project_space_service.get_artifact(body.artifact_id)

    return success_response(
        data={
            "recommendation": recommendation,
            "artifact": to_artifact_model(
                updated_artifact or animation_artifact,
                current_version_id=current_version_id,
            ).model_dump(mode="json"),
        },
        message="动画插入推荐生成成功",
    )


@router.post("/studio-cards/demonstration_animations/confirm-placement")
async def confirm_animation_placement(
    body: AnimationPlacementConfirmRequest,
    user_id: str = Depends(get_current_user),
):
    await project_space_service.check_project_permission(
        body.project_id,
        user_id,
        ProjectPermission.COLLABORATE,
    )
    animation_artifact = await require_animation_artifact(
        body.project_id,
        body.artifact_id,
    )
    await require_ppt_artifact(body.project_id, body.ppt_artifact_id)

    placement_records = build_animation_placement_records(
        ppt_artifact_id=body.ppt_artifact_id,
        page_numbers=body.page_numbers,
        slot=body.slot,
    )
    metadata = apply_animation_placement_update(
        metadata=artifact_metadata_dict(animation_artifact),
        placement_records=placement_records,
    )
    if hasattr(project_space_service.db, "update_artifact_metadata"):
        await project_space_service.db.update_artifact_metadata(
            body.artifact_id,
            metadata,
        )

    project = await project_space_service.db.get_project(body.project_id)
    current_version_id = getattr(project, "currentVersionId", None) if project else None
    updated_artifact = await project_space_service.get_artifact(body.artifact_id)

    return success_response(
        data={
            "placements": placement_records,
            "artifact": to_artifact_model(
                updated_artifact or animation_artifact,
                current_version_id=current_version_id,
            ).model_dump(mode="json"),
        },
        message="动画插入关系记录成功",
    )
