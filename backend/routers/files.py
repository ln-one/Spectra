import logging
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    status,
)
from pydantic import BaseModel

from services import db_service, file_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException
from utils.responses import success_response

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger(__name__)


class UpdateFileIntentRequest(BaseModel):
    """标注文件用途请求"""

    usage_intent: str


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    上传参考文件

    Args:
        file: 上传的文件
        project_id: 项目ID
        user_id: 当前用户ID（从认证依赖获取）
        idempotency_key: 幂等性密钥（可选）

    Returns:
        上传的文件信息

    Raises:
        HTTPException: 上传失败时抛出
    """
    try:
        # TODO: Verify project belongs to user (data isolation)
        # project = await db_service.get_project(project_id)
        # if project.userId != user_id:
        #     raise ForbiddenException(message="无权限访问此项目")

        # TODO: Implement idempotency check if idempotency_key is provided
        # if idempotency_key:
        #     cached_response = await check_idempotency(idempotency_key)
        #     if cached_response:
        #         return cached_response

        # TODO: Verify project belongs to user (data isolation)
        # project = await db_service.get_project(project_id)
        # if project.userId != user_id:
        #     raise ForbiddenException(message="无权限访问此项目")

        # Read file content
        content = await file.read()

        # Save file
        filepath, file_size = await file_service.save_file(file.filename, content)

        # Determine file type from extension
        file_extension = (
            file.filename.split(".")[-1].lower() if "." in file.filename else ""
        )
        file_type_map = {
            "pdf": "pdf",
            "docx": "docx",
            "doc": "docx",
            "pptx": "pptx",
            "ppt": "pptx",
            "mp4": "video",
            "mov": "video",
        }
        file_type = file_type_map.get(file_extension, "other")

        # Record upload in database with all required fields
        upload = await db_service.create_upload(
            filename=file.filename,
            filepath=filepath,
            size=file_size,
            project_id=project_id,
            file_type=file_type,
        )

        logger.info(
            "file_uploaded",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "file_id": upload.id,
                "filename": file.filename,
                "size": file_size,
            },
        )

        return success_response(data={"file": upload}, message="文件上传成功")
    except APIException as e:
        logger.error(
            f"Failed to upload file: {e.message}",
            extra={
                "user_id": user_id,
                "project_id": project_id,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to upload file: {str(e)}",
            extra={"user_id": user_id, "project_id": project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file",
        )


@router.patch("/{file_id}/intent")
async def update_file_intent(
    file_id: str,
    request: UpdateFileIntentRequest,
    user_id: str = Depends(get_current_user),
):
    """
    标注文件用途

    Args:
        file_id: 文件ID
        request: 文件用途标注请求
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        更新后的文件信息

    Raises:
        HTTPException: 文件不存在或无权限访问时抛出
    """
    try:
        # TODO: Get file from database
        # file = await db_service.get_file(file_id)

        # TODO: Check if file belongs to user's project
        # project = await db_service.get_project(file.projectId)
        # if project.userId != user_id:
        #     raise ForbiddenException(
        #         message="无权限访问此文件",
        #     )

        # TODO: Update file intent in database
        # updated_file = await db_service.update_file_intent(
        #     file_id, request.usage_intent
        # )

        logger.info(
            "file_intent_updated",
            extra={
                "user_id": user_id,
                "file_id": file_id,
                "usage_intent": request.usage_intent,
            },
        )

        # TEMPORARY: Return mock response
        return success_response(
            data={
                "file": {
                    "id": file_id,
                    "filename": "example.pdf",
                    "usage_intent": request.usage_intent,
                }
            },
            message="文件用途标注成功",
        )
    except APIException as e:
        logger.error(
            f"Failed to update file intent: {e.message}",
            extra={"user_id": user_id, "file_id": file_id, "error_code": e.error_code},
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to update file intent: {str(e)}",
            extra={"user_id": user_id, "file_id": file_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update file intent",
        )
