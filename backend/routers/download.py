"""
文件下载路由

职责：处理生成文件的下载请求
"""

import logging
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse

from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import (
    APIException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from utils.file_utils import safe_path_join, validate_file_exists
from utils.filename_utils import safe_filename_for_header

router = APIRouter(prefix="/generate/tasks", tags=["Generate"])
logger = logging.getLogger(__name__)


@router.get("/{task_id}/download")
async def download_courseware(
    task_id: str,
    file_type: Literal["ppt", "word"] = Query(...),
    user_id: str = Depends(get_current_user),
):
    """
    下载生成的课件文件

    Args:
        task_id: 任务ID
        file_type: 文件类型（ppt 或 word）
        user_id: 当前用户ID

    Returns:
        FileResponse: 课件文件
    """
    try:
        # 获取任务并验证权限
        task = await db_service.get_generation_task(task_id)
        if not task:
            raise NotFoundException(message=f"任务不存在: {task_id}")

        project = await db_service.get_project(task.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权限访问此任务")

        # 检查任务状态
        if task.status != "completed":
            raise ValidationException(
                message=f"任务尚未完成，当前状态: {task.status}",
            )

        # 确定文件路径（使用安全路径工具防止路径遍历）
        generated_dir = Path("generated")
        safe_task_id = re.sub(r"[^a-zA-Z0-9_-]", "", task_id)
        if file_type == "ppt":
            file_path = safe_path_join(generated_dir, f"{safe_task_id}.pptx")
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".presentationml.presentation"
            )
            # 生成安全的文件名
            base_name = project.name or "courseware"
            safe_name = safe_filename_for_header(f"{base_name}_{task_id}")
            filename = f"{safe_name}.pptx"
        else:
            file_path = safe_path_join(
                generated_dir, f"{safe_task_id}_lesson_plan.docx"
            )
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            )
            # 生成安全的文件名
            base_name = project.name or "courseware"
            safe_name = safe_filename_for_header(f"{base_name}_lesson_plan_{task_id}")
            filename = f"{safe_name}.docx"

        # 检查文件存在且有效
        if not validate_file_exists(file_path, min_size=1):
            logger.error(
                f"File not found: {file_path}",
                extra={"task_id": task_id, "file_type": file_type},
            )
            raise NotFoundException(message=f"生成的文件不存在: {file_type}")

        logger.info(
            "courseware_downloaded",
            extra={"user_id": user_id, "task_id": task_id, "file_type": file_type},
        )

        return FileResponse(
            path=str(file_path), media_type=media_type, filename=filename
        )

    except APIException:
        raise
    except Exception as e:
        logger.error(
            "download_failed: task_id=%s file_type=%s error=%s",
            task_id,
            file_type,
            e,
            exc_info=True,
        )
        raise
