"""Preview router with minimal MVP implementation."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/preview", tags=["Preview"])
logger = logging.getLogger(__name__)


async def _resolve_task(task_or_project_id: str, user_id: str):
    """Resolve identifier as task_id first, then project_id fallback."""
    task = await db_service.get_generation_task(task_or_project_id)
    if task:
        project = await db_service.get_project(task.projectId)
        if not project or project.userId != user_id:
            raise ForbiddenException(message="无权限访问此任务")
        return task, project

    project = await db_service.get_project(task_or_project_id)
    if not project:
        raise NotFoundException(message=f"任务或项目不存在: {task_or_project_id}")
    if project.userId != user_id:
        raise ForbiddenException(message="无权限访问此项目")

    latest_task = await db_service.get_latest_generation_task_by_project(
        project_id=project.id,
        completed_only=True,
    )
    if not latest_task:
        raise NotFoundException(message="暂无可预览的生成任务")
    return latest_task, project


@router.get("/{task_id}")
async def get_preview(task_id: str, user_id: str = Depends(get_current_user)):
    """Get preview data by task_id (or project_id for frontend compatibility)."""
    try:
        task, project = await _resolve_task(task_id, user_id)

        slides = [
            {
                "id": f"{task.id}-slide-1",
                "index": 1,
                "page_number": 1,
                "title": project.name,
                "content": (
                    f"项目「{project.name}」课件已生成。\n"
                    "你可以在页面中下载 PPT 与 Word 文件，或回到对话页继续修改需求。"
                ),
            },
            {
                "id": f"{task.id}-slide-2",
                "index": 2,
                "page_number": 2,
                "title": "任务信息",
                "content": (
                    f"任务状态: {task.status}\n"
                    f"任务类型: {task.taskType}\n"
                    f"进度: {task.progress}%"
                ),
            },
        ]

        return success_response(
            data={
                "task_id": task.id,
                "slides": slides,
                "lesson_plan": "请下载 Word 教案查看完整内容。",
            },
            message="获取预览成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Get preview failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取预览失败",
        )


@router.post("/{task_id}/modify")
async def modify_courseware(task_id: str, user_id: str = Depends(get_current_user)):
    """Create a lightweight modify task response for MVP."""
    try:
        task, _ = await _resolve_task(task_id, user_id)
        return success_response(
            data={"modify_task_id": f"modify-{task.id}", "status": "processing"},
            message="修改任务已创建",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Modify preview failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="修改课件失败",
        )
