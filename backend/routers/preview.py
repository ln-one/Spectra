"""Preview router with minimal MVP implementation."""

import html
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from schemas.generation import ModifyRequest
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/preview", tags=["Preview"])
logger = logging.getLogger(__name__)


class ExportRequest(BaseModel):
    """导出请求"""

    format: str = Field(..., description="导出格式: json/markdown/html")
    include_sources: bool = Field(True, description="是否包含来源信息")


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


def _build_slides(task, project):
    """Build slides payload for a task."""
    return [
        {
            "id": f"{task.id}-slide-1",
            "index": 0,
            "title": project.name,
            "content": (
                f"项目《{project.name}》课件已生成。\n"
                "你可以在页面中下载 PPT 或 Word 文件，或回到对话页继续修改需求。"
            ),
        },
        {
            "id": f"{task.id}-slide-2",
            "index": 1,
            "title": "任务信息",
            "content": (
                f"任务状态: {task.status}\n"
                f"任务类型: {task.taskType}\n"
                f"进度: {task.progress}%"
            ),
        },
    ]


@router.get("/{task_id}")
async def get_preview(task_id: str, user_id: str = Depends(get_current_user)):
    """Get preview data by task_id (or project_id for frontend compatibility)."""
    try:
        task, project = await _resolve_task(task_id, user_id)
        slides = _build_slides(task, project)

        return success_response(
            data={
                "task_id": task.id,
                "slides": slides,
                "lesson_plan": {
                    "teaching_objectives": [
                        "了解课程核心内容",
                        "掌握重难点知识",
                    ],
                    "slides_plan": [
                        {
                            "slide_id": s["id"],
                            "teaching_goal": s["title"],
                            "teacher_script": s["content"],
                        }
                        for s in slides
                    ],
                },
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
async def modify_courseware(
    task_id: str,
    request: ModifyRequest,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[UUID] = Header(None, alias="Idempotency-Key"),
):
    """Create a modify task based on user instruction."""
    try:
        task, _ = await _resolve_task(task_id, user_id)
        key_str = str(idempotency_key) if idempotency_key else None
        cache_key = f"preview:modify:{user_id}:{task.id}:{key_str}" if key_str else None
        if cache_key:
            cached_response = await db_service.get_idempotency_response(cache_key)
            if cached_response:
                logger.info(
                    "idempotency_cache_hit",
                    extra={
                        "user_id": user_id,
                        "task_id": task.id,
                        "idempotency_key": key_str,
                    },
                )
                return cached_response

        logger.info(
            "courseware_modify_requested",
            extra={
                "user_id": user_id,
                "task_id": task.id,
                "instruction_length": len(request.instruction),
                "idempotency_key": key_str,
            },
        )

        response_payload = success_response(
            data={
                "modify_task_id": f"modify-{task.id}",
                "status": "processing",
            },
            message="修改任务已创建",
        )
        if cache_key:
            await db_service.save_idempotency_response(
                cache_key, jsonable_encoder(response_payload)
            )
        return response_payload
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Modify preview failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="修改课件失败",
        )


@router.get("/{task_id}/slides/{slide_id}")
async def get_slide_detail(
    task_id: str,
    slide_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get single slide detail by slide_id."""
    try:
        task, project = await _resolve_task(task_id, user_id)
        slides = _build_slides(task, project)

        target_slide = next((s for s in slides if s["id"] == slide_id), None)
        if not target_slide:
            raise NotFoundException(message=f"幻灯片不存在: {slide_id}")

        related = [
            {"slide_id": s["id"], "title": s["title"], "relation": "related"}
            for s in slides
            if s["id"] != slide_id
        ]

        return success_response(
            data={
                "slide": target_slide,
                "teaching_plan": {
                    "slide_id": target_slide["id"],
                    "teaching_goal": target_slide["title"],
                    "teacher_script": target_slide["content"],
                },
                "related_slides": related,
            },
            message="获取幻灯片详情成功",
        )
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Get slide detail failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取幻灯片详情失败",
        )


@router.post("/{task_id}/export")
async def export_preview(
    task_id: str,
    request: ExportRequest,
    user_id: str = Depends(get_current_user),
):
    """Export preview content in the requested format."""
    try:
        task, project = await _resolve_task(task_id, user_id)
        slides = _build_slides(task, project)

        if request.format not in ("json", "markdown", "html"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的导出格式: {request.format}",
            )

        if request.format == "json":
            content = json.dumps({"slides": slides}, ensure_ascii=False, indent=2)
        elif request.format == "markdown":
            parts = []
            for s in slides:
                parts.append(f"## {s['title']}\n\n{s['content']}")
            content = "\n\n---\n\n".join(parts)
        else:  # html
            parts = []
            for s in slides:
                safe_title = html.escape(s["title"], quote=True)
                safe_content = html.escape(s["content"], quote=True)
                parts.append(
                    f"<section><h2>{safe_title}</h2><p>{safe_content}</p></section>"
                )
            content = "\n".join(parts)

        logger.info(
            "preview_exported",
            extra={
                "user_id": user_id,
                "task_id": task.id,
                "format": request.format,
            },
        )

        return success_response(
            data={"content": content, "format": request.format},
            message="导出成功",
        )
    except APIException:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export preview failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="导出预览失败",
        )
