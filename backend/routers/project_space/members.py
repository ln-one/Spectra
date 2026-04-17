"""Member routes for Project Space."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from fastapi.encoders import jsonable_encoder

from schemas.project_space import (
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMembersResponse,
    ProjectMemberUpdate,
    SimpleSuccessResponse,
)
from services.project_space_service.service import project_space_service
from utils.dependencies import get_current_user

from .shared import COMMON_ERROR_RESPONSES, to_project_member_model

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/{project_id}/members",
    response_model=ProjectMembersResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def get_project_members(
    project_id: str, user_id: str = Depends(get_current_user)
):
    try:
        members = await project_space_service.get_project_members(
            project_id=project_id, user_id=user_id
        )
        return ProjectMembersResponse(
            members=[to_project_member_model(member) for member in members]
        )
    except Exception as exc:
        logger.error(f"get_project_members error: {exc}")
        raise


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    responses={**COMMON_ERROR_RESPONSES, 400: {"description": "Bad Request"}},
)
async def create_project_member(
    project_id: str,
    body: ProjectMemberCreate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            "project-space:members:create:"
            f"{user_id}:{project_id}:{body.user_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            cached = await project_space_service.get_idempotency_response(cache_key)
            if cached:
                return cached

        permissions_dict = body.permissions.model_dump() if body.permissions else None
        member = await project_space_service.create_project_member(
            project_id=project_id,
            user_id=user_id,
            target_user_id=body.user_id,
            role=body.role,
            permissions=permissions_dict,
        )

        response_payload = ProjectMemberResponse(member=to_project_member_model(member))
        if cache_key:
            await project_space_service.save_idempotency_response(
                cache_key, jsonable_encoder(response_payload)
            )
        return response_payload
    except Exception as exc:
        logger.error(f"create_project_member error: {exc}")
        raise


@router.patch(
    "/{project_id}/members/{member_id}",
    response_model=ProjectMemberResponse,
    responses={**COMMON_ERROR_RESPONSES, 400: {"description": "Bad Request"}},
)
async def update_project_member(
    project_id: str,
    member_id: str,
    body: ProjectMemberUpdate,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = (
            f"project-space:members:update:{user_id}:{project_id}:{member_id}:{key_str}"
            if key_str
            else None
        )
        if cache_key:
            cached = await project_space_service.get_idempotency_response(cache_key)
            if cached:
                return cached

        permissions_dict = body.permissions.model_dump() if body.permissions else None
        updated_member = await project_space_service.update_project_member(
            project_id=project_id,
            member_id=member_id,
            user_id=user_id,
            role=body.role,
            permissions=permissions_dict,
            status=body.status,
        )

        response_payload = ProjectMemberResponse(
            member=to_project_member_model(updated_member)
        )
        if cache_key:
            await project_space_service.save_idempotency_response(
                cache_key, jsonable_encoder(response_payload)
            )
        return response_payload
    except Exception as exc:
        logger.error(f"update_project_member error: {exc}")
        raise


@router.delete(
    "/{project_id}/members/{member_id}",
    response_model=SimpleSuccessResponse,
    responses=COMMON_ERROR_RESPONSES,
)
async def delete_project_member(
    project_id: str, member_id: str, user_id: str = Depends(get_current_user)
):
    try:
        await project_space_service.delete_project_member(
            project_id=project_id, member_id=member_id, user_id=user_id
        )
        return SimpleSuccessResponse(ok=True)
    except Exception as exc:
        logger.error(f"delete_project_member error: {exc}")
        raise
