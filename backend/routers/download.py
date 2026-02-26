"""
文件下载路由

职责：处理生成文件的下载请求
"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException

router = APIRouter(prefix="/generate/tasks", tags=["Generate"])
logger = logging.getLogger(__name__)


@router.get("/{task_id}/download")
async def download_courseware(
    task_id: str,
    file_type: str = Query(..., regex="^(ppt|word)$"),
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"任务尚未完成，当前状态: {task.status}",
            )

        # 确定文件路径
        generated_dir = Path("generated")
        if file_type == "ppt":
            file_path = generated_dir / f"{task_id}.pptx"
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".presentationml.presentation"
            )
            filename = f"{project.name or 'courseware'}_{task_id}.pptx"
        else:
            file_path = generated_dir / f"{task_id}_lesson_plan.docx"
            media_type = (
                "application/vnd.openxmlformats-officedocument"
                ".wordprocessingml.document"
            )
            filename = f"{project.name or 'courseware'}_lesson_plan_{task_id}.docx"

        # 检查文件存在
        if not file_path.exists():
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
        logger.error(f"Download failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download courseware",
        )
