import logging
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services import db_service, file_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.file_utils import validate_file_exists
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
    # REVIEW #B5 (P1): OpenAPI 将 Idempotency-Key 定义为 Header，此处按 Query 读取，契约不一致。
    idempotency_key: Optional[str] = Query(None, alias="Idempotency-Key"),
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


@router.get("/download/{task_id}/{file_type}")
async def download_generated_file(
    task_id: str,
    file_type: str,
    user_id: str = Depends(get_current_user),
):
    """
    下载生成的课件文件

    Args:
        task_id: 任务 ID
        file_type: 文件类型（pptx/docx）
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        FileResponse: 文件下载响应

    Raises:
        HTTPException: 文件不存在或无权限访问时抛出
    """
    try:
        # 验证文件类型
        if file_type not in ["pptx", "docx"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: {file_type}. Must be 'pptx' or 'docx'",
            )

        # 获取任务
        task = await db_service.get_generation_task(task_id)
        if not task:
            raise NotFoundException(
                message=f"任务不存在: {task_id}",
            )

        # 验证权限：检查任务所属项目是否属于当前用户
        project = await db_service.get_project(task.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(
                message="无权限下载此文件",
            )

        # 检查任务是否完成
        if task.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"任务尚未完成，当前状态: {task.status}",
            )

        # 构建文件路径
        output_dir = Path("generated")
        if file_type == "pptx":
            file_path = output_dir / f"{task_id}.pptx"
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".presentationml.presentation"
            )
            filename = f"{task_id}.pptx"
        else:  # docx
            file_path = output_dir / f"{task_id}_lesson_plan.docx"
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            )
            filename = f"{task_id}_lesson_plan.docx"

        # 验证文件存在
        if not validate_file_exists(file_path, min_size=1):
            raise NotFoundException(
                message=f"文件不存在或已被删除: {filename}",
            )

        logger.info(
            "file_downloaded",
            extra={
                "user_id": user_id,
                "task_id": task_id,
                "file_type": file_type,
                "file_path": str(file_path),
            },
        )

        # 返回文件
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except APIException as e:
        logger.error(
            f"Failed to download file: {e.message}",
            extra={
                "user_id": user_id,
                "task_id": task_id,
                "file_type": file_type,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to download file: {str(e)}",
            extra={"user_id": user_id, "task_id": task_id, "file_type": file_type},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file",
        )
