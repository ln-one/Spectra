"""
Preview Router - 课件预览、修改、导出

四个端点对齐 docs/openapi/paths/preview.yaml 规范。
辅助函数见 services/preview_helpers.py。
"""

import json
import logging
from html import escape as html_escape

from fastapi import APIRouter, Depends, HTTPException, status

from schemas.preview import (
    ExportData,
    ExportFormat,
    ExportRequest,
    ModifyRequest,
    ModifyResponse,
    RelatedSlide,
    SlideDetailData,
)
from services.database import db_service
from services.preview_helpers import (
    build_lesson_plan,
    build_slides,
    get_or_generate_content,
    save_preview_content,
)
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
        project_id=project.id, completed_only=True
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
    """获取课件预览（slides + lesson_plan）"""
    try:
        task, project = await _resolve_task(task_id, user_id)
        content = await get_or_generate_content(task, project)

        slides = build_slides(task.id, content["markdown_content"])
        lesson_plan = build_lesson_plan(slides, content.get("lesson_plan_markdown", ""))

        return success_response(
            data={
                "task_id": task.id,
                "slides": [s.model_dump() for s in slides],
                "lesson_plan": lesson_plan.model_dump(),
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
async def modify_preview(
    task_id: str,
    body: ModifyRequest,
    user_id: str = Depends(get_current_user),
):
    """提交修改指令，差异化重新生成目标 slides"""
    try:
        task, project = await _resolve_task(task_id, user_id)
        content = await get_or_generate_content(task, project)

        from services.ai import ai_service

        target_slides = body.target_slides
        if not target_slides:
            modify_intent = await ai_service.parse_modify_intent(body.instruction)
            target_slides = modify_intent.target_slides

        modified = await ai_service.modify_courseware(
            current_content=content["markdown_content"],
            instruction=body.instruction,
            target_slides=target_slides,
        )

        new_content = {
            "title": modified.title,
            "markdown_content": modified.markdown_content,
            "lesson_plan_markdown": modified.lesson_plan_markdown,
        }
        await save_preview_content(task.id, new_content)

        return success_response(
            data=ModifyResponse(
                modify_task_id=f"modify-{task.id}",
                status="completed",
            ).model_dump(),
            message="修改完成",
        )
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
    """获取单个幻灯片详情"""
    try:
        task, project = await _resolve_task(task_id, user_id)
        content = await get_or_generate_content(task, project)

        slides = build_slides(task.id, content["markdown_content"])
        lesson_plan = build_lesson_plan(slides, content.get("lesson_plan_markdown", ""))

        target = None
        target_idx = -1
        for i, s in enumerate(slides):
            if s.id == slide_id:
                target = s
                target_idx = i
                break

        if not target:
            raise NotFoundException(message=f"幻灯片不存在: {slide_id}")

        teaching_plan = None
        for sp in lesson_plan.slides_plan:
            if sp.slide_id == slide_id:
                teaching_plan = sp
                break

        related: list[RelatedSlide] = []
        if target_idx > 0:
            prev = slides[target_idx - 1]
            related.append(
                RelatedSlide(slide_id=prev.id, title=prev.title, relation="previous")
            )
        if target_idx < len(slides) - 1:
            nxt = slides[target_idx + 1]
            related.append(
                RelatedSlide(slide_id=nxt.id, title=nxt.title, relation="next")
            )

        data = SlideDetailData(
            slide=target,
            teaching_plan=teaching_plan,
            related_slides=related,
        )
        return success_response(data=data.model_dump(), message="获取幻灯片详情成功")
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
    body: ExportRequest,
    user_id: str = Depends(get_current_user),
):
    """导出预览内容（json/markdown/html）"""
    try:
        task, project = await _resolve_task(task_id, user_id)
        content = await get_or_generate_content(task, project)

        slides = build_slides(task.id, content["markdown_content"])
        lesson_plan = build_lesson_plan(slides, content.get("lesson_plan_markdown", ""))

        if body.format == ExportFormat.JSON:
            export_content = json.dumps(
                {
                    "slides": [s.model_dump() for s in slides],
                    "lesson_plan": lesson_plan.model_dump(),
                },
                ensure_ascii=False,
                indent=2,
            )
        elif body.format == ExportFormat.MARKDOWN:
            export_content = content["markdown_content"]
            if body.include_sources:
                export_content += "\n\n---\n\n" + content.get(
                    "lesson_plan_markdown", ""
                )
        else:
            slides_html = "".join(
                f"<section><h2>{html_escape(s.title)}</h2>"
                f"<div>{html_escape(s.content)}</div></section>\n"
                for s in slides
            )
            export_content = (
                f"<!DOCTYPE html><html><head>"
                f"<meta charset='utf-8'>"
                f"<title>{html_escape(content.get('title', 'Preview'))}</title>"
                f"</head><body>{slides_html}</body></html>"
            )

        data = ExportData(content=export_content, format=body.format.value)
        return success_response(data=data.model_dump(), message="导出成功")
    except APIException:
        raise
    except Exception as e:
        logger.error(f"Export preview failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="导出预览失败",
        )
