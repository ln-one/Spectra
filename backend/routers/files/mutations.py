from fastapi import APIRouter, Depends, HTTPException, status

import routers.files as files_package
from services.file_management_service import (
    batch_delete_files_response,
    delete_file_response,
    update_file_intent_response,
)
from utils.dependencies import get_current_user
from utils.exceptions import APIException

from .shared import BatchDeleteRequest, UpdateFileIntentRequest, logger

router = APIRouter()


@router.patch("/{file_id}/intent")
async def update_file_intent(
    file_id: str,
    request: UpdateFileIntentRequest,
    user_id: str = Depends(get_current_user),
):
    try:
        response = await update_file_intent_response(
            file_id=file_id,
            usage_intent=request.usage_intent,
            user_id=user_id,
        )
        logger.info(
            "file_intent_updated",
            extra={
                "user_id": user_id,
                "file_id": file_id,
                "usage_intent": request.usage_intent,
            },
        )
        return response
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to update file intent: %s",
            exc,
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update file intent: {exc}",
        )


@router.delete("/batch")
async def batch_delete_files(
    request: BatchDeleteRequest,
    user_id: str = Depends(get_current_user),
):
    return await batch_delete_files_response(
        file_ids=request.file_ids,
        user_id=user_id,
        cleanup_func=files_package.cleanup_file,
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    user_id: str = Depends(get_current_user),
):
    try:
        file = await delete_file_response(
            file_id=file_id,
            user_id=user_id,
            cleanup_func=files_package.cleanup_file,
        )
        logger.info(
            "file_deleted",
            extra={
                "user_id": user_id,
                "file_id": file_id,
                "project_id": file.projectId,
            },
        )
        return {
            "success": True,
            "data": {"file_id": file_id},
            "message": "文件删除成功",
        }
    except APIException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to delete file: %s",
            exc,
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {exc}",
        )
