"""Reference and candidate change routes for Project Space."""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from schemas.project_space import (
    CandidateChangeCreate,
    CandidateChangeResponse,
    CandidateChangeReview,
    CandidateChangesResponse,
    CandidateChangeStatus,
    ProjectPermission,
    ProjectReferenceCreate,
    ProjectReferenceResponse,
    ProjectReferencesResponse,
    ProjectReferenceUpdate,
    SimpleSuccessResponse,
)
from services.project_space_service import project_space_service
from utils.dependencies import get_current_user

from .reference_runtime import resolve_target_version_map
from .shared import (
    COMMON_ERROR_RESPONSES,
    to_candidate_change_model,
    to_project_reference_model,
)

router = APIRouter()
logger = logging.getLogger(__name__)


async def resolve_target_project_name_map(db_service, references) -> dict[str, str]:
    target_ids = sorted(
        {
            str(getattr(reference, "targetProjectId", "")).strip()
            for reference in references
            if str(getattr(reference, "targetProjectId", "")).strip()
        }
    )
    if not target_ids:
        return {}

    projects = await asyncio.gather(
        *(db_service.get_project(target_id) for target_id in target_ids),
        return_exceptions=True,
    )
    name_map: dict[str, str] = {}
    for target_id, project in zip(target_ids, projects):
        if isinstance(project, Exception) or project is None:
            continue
        name = str(getattr(project, "name", "")).strip()
        if name:
            name_map[target_id] = name
    return name_map


@router.post(
    "/{project_id}/references",
    response_model=ProjectReferenceResponse,
    responses={
        **COMMON_ERROR_RESPONSES,
        400: {"description": "Bad Request"},
        409: {"description": "Conflict"},
    },
)
async def create_project_reference(
    project_id: str,
    body: ProjectReferenceCreate,
    user_id: str = Depends(get_current_user),
):
    try:
        reference = await project_space_service.create_project_reference(
            project_id=project_id,
            user_id=user_id,
            target_project_id=body.target_project_id,
            relation_type=body.relation_type,
            mode=body.mode,
            pinned_version_id=body.pinned_version_id,
            priority=body.priority,
        )
        version_map = await resolve_target_version_map(
            db_service=project_space_service.db,
            references=[reference],
        )
        target_name_map = await resolve_target_project_name_map(
            project_space_service.db, [reference]
        )
        return ProjectReferenceResponse(
            success=True,
            data={
                "reference": to_project_reference_model(
                    reference,
                    upstream_current_version_id=version_map.get(
                        reference.targetProjectId
                    ),
                    target_project_name=target_name_map.get(reference.targetProjectId),
                )
            },
            message="创建引用成功",
        )
    except Exception as exc:
        logger.error(f"create_project_reference error: {exc}")
        raise


@router.get(
    "/{project_id}/references",
    response_model=ProjectReferencesResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_references(
    project_id: str, user_id: str = Depends(get_current_user)
):
    try:
        references = await project_space_service.get_project_references(
            project_id=project_id, user_id=user_id
        )
        version_map = await resolve_target_version_map(
            db_service=project_space_service.db,
            references=references,
        )
        target_name_map = await resolve_target_project_name_map(
            project_space_service.db, references
        )
        return ProjectReferencesResponse(
            success=True,
            data={
                "references": [
                    to_project_reference_model(
                        ref,
                        upstream_current_version_id=version_map.get(
                            ref.targetProjectId
                        ),
                        target_project_name=target_name_map.get(ref.targetProjectId),
                    )
                    for ref in references
                ]
            },
            message="获取引用列表成功",
        )
    except Exception as exc:
        logger.error(f"get_project_references error: {exc}")
        raise


@router.patch(
    "/{project_id}/references/{reference_id}",
    response_model=ProjectReferenceResponse,
    responses={**COMMON_ERROR_RESPONSES, 400: {"description": "Bad Request"}},
)
async def update_project_reference(
    project_id: str,
    reference_id: str,
    body: ProjectReferenceUpdate,
    user_id: str = Depends(get_current_user),
):
    try:
        updated_ref = await project_space_service.update_project_reference(
            project_id=project_id,
            reference_id=reference_id,
            user_id=user_id,
            mode=body.mode,
            pinned_version_id=body.pinned_version_id,
            priority=body.priority,
            status=body.status,
        )
        version_map = await resolve_target_version_map(
            db_service=project_space_service.db,
            references=[updated_ref],
        )
        target_name_map = await resolve_target_project_name_map(
            project_space_service.db, [updated_ref]
        )
        return ProjectReferenceResponse(
            success=True,
            data={
                "reference": to_project_reference_model(
                    updated_ref,
                    upstream_current_version_id=version_map.get(
                        updated_ref.targetProjectId
                    ),
                    target_project_name=target_name_map.get(
                        updated_ref.targetProjectId
                    ),
                )
            },
            message="更新引用成功",
        )
    except Exception as exc:
        logger.error(f"update_project_reference error: {exc}")
        raise


@router.delete(
    "/{project_id}/references/{reference_id}",
    response_model=SimpleSuccessResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def delete_project_reference(
    project_id: str, reference_id: str, user_id: str = Depends(get_current_user)
):
    try:
        await project_space_service.delete_project_reference(
            project_id=project_id, reference_id=reference_id, user_id=user_id
        )
        return SimpleSuccessResponse(success=True, data={}, message="删除引用成功")
    except Exception as exc:
        logger.error(f"delete_project_reference error: {exc}")
        raise


@router.post(
    "/{project_id}/candidate-changes",
    response_model=CandidateChangeResponse,
    responses={
        **COMMON_ERROR_RESPONSES,
        400: {"description": "Bad Request"},
        409: {"description": "Conflict"},
    },
)
async def create_candidate_change(
    project_id: str,
    body: CandidateChangeCreate,
    user_id: str = Depends(get_current_user),
):
    try:
        change = await project_space_service.create_candidate_change(
            project_id=project_id,
            user_id=user_id,
            title=body.title,
            summary=body.summary,
            payload=body.payload,
            session_id=body.session_id,
            base_version_id=body.base_version_id,
        )
        return CandidateChangeResponse(
            success=True,
            data={"change": to_candidate_change_model(change)},
            message="提交候选变更成功",
        )
    except Exception as exc:
        logger.error(f"create_candidate_change error: {exc}")
        raise


@router.get(
    "/{project_id}/candidate-changes",
    response_model=CandidateChangesResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_candidate_changes(
    project_id: str,
    status: Optional[CandidateChangeStatus] = Query(None, description="Status filter"),
    proposer_user_id: Optional[str] = Query(
        None, description="Proposer user ID filter"
    ),
    session_id: Optional[str] = Query(None, description="Session ID filter"),
    user_id: str = Depends(get_current_user),
):
    try:
        changes = await project_space_service.get_candidate_changes(
            project_id=project_id,
            user_id=user_id,
            status=status.value if status else None,
            proposer_user_id=proposer_user_id,
            session_id=session_id,
        )
        return CandidateChangesResponse(
            success=True,
            data={"changes": [to_candidate_change_model(change) for change in changes]},
            message="获取候选变更列表成功",
        )
    except Exception as exc:
        logger.error(f"get_candidate_changes error: {exc}")
        raise


@router.post(
    "/{project_id}/candidate-changes/{change_id}/review",
    response_model=CandidateChangeResponse,
    responses={
        **COMMON_ERROR_RESPONSES,
        400: {"description": "Bad Request"},
        409: {"description": "Conflict"},
    },
)
async def review_candidate_change(
    project_id: str,
    change_id: str,
    body: CandidateChangeReview,
    user_id: str = Depends(get_current_user),
):
    try:
        await project_space_service.check_project_permission(
            project_id, user_id, ProjectPermission.MANAGE
        )
        updated_change = await project_space_service.review_candidate_change(
            project_id=project_id,
            change_id=change_id,
            action=body.action,
            review_comment=body.review_comment,
            reviewer_user_id=user_id,
        )
        return CandidateChangeResponse(
            success=True,
            data={"change": to_candidate_change_model(updated_change)},
            message=f"审核成功: {body.action}",
        )
    except Exception as exc:
        logger.error(f"review_candidate_change error: {exc}")
        raise
