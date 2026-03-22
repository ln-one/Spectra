from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from schemas.system_settings import SystemSettingsUpdateRequest
from services.system_settings_service import system_settings_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, InternalServerException
from utils.responses import success_response

router = APIRouter(prefix="/system-settings", tags=["System Settings"])
logger = logging.getLogger(__name__)


@router.get("")
async def get_system_settings(user_id: str = Depends(get_current_user)):
    try:
        settings = system_settings_service.get_settings()
        return success_response(
            data=settings.model_dump(),
            message="获取系统级业务配置成功",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to get system settings: %s",
            exc,
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise InternalServerException(message="获取系统级业务配置失败")


@router.patch("")
async def patch_system_settings(
    body: SystemSettingsUpdateRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    try:
        settings = system_settings_service.update_settings(body)
        updated_sections = list(body.model_dump(exclude_none=True).keys())
        logger.info(
            "system_settings_updated",
            extra={
                "user_id": user_id,
                "idempotency_key": bool(idempotency_key),
                "updated_sections": updated_sections,
            },
        )
        return success_response(
            data=settings.model_dump(),
            message="更新系统级业务配置成功",
        )
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to patch system settings: %s",
            exc,
            extra={"user_id": user_id},
            exc_info=True,
        )
        raise InternalServerException(message="更新系统级业务配置失败")
