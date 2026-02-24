import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header, status

from schemas.generation import GenerateRequest, GenerateResponse
from services.database import db_service
from utils.dependencies import get_current_user
from utils.exceptions import APIException, ErrorCode, ForbiddenException, NotFoundException
from utils.responses import success_response

router = APIRouter(prefix="/generate", tags=["Generate"])
logger = logging.getLogger(__name__)


@router.post("/courseware", response_model=GenerateResponse)
async def generate_courseware(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    生成课件
    
    创建一个后台生成任务，立即返回任务 ID。
    任务将在后台异步处理，用户可通过 /generate/status/{task_id} 查询状态。

    Args:
        request: 生成请求（包含项目ID和生成类型）
        background_tasks: FastAPI 后台任务
        user_id: 当前用户ID（从认证依赖获取）
        idempotency_key: 幂等性密钥（可选）

    Returns:
        GenerateResponse: 包含任务 ID 和初始状态

    Raises:
        HTTPException: 项目不存在或无权限访问时抛出
    """
    try:
        # 验证项目归属
        project = await db_service.get_project(request.project_id)
        if not project:
            raise NotFoundException(
                message=f"项目不存在: {request.project_id}",
            )
        
        if project.userId != user_id:
            raise ForbiddenException(
                message="无权限访问此项目",
            )
        
        # TODO: 实现幂等性检查
        # if idempotency_key:
        #     existing_response = await db_service.get_idempotency_response(idempotency_key)
        #     if existing_response:
        #         return existing_response
        
        # 创建生成任务
        task = await db_service.create_generation_task(
            project_id=request.project_id,
            task_type=request.type.value,
            template_config=request.template_config.model_dump() if request.template_config else None,
        )
        
        # 添加后台任务
        background_tasks.add_task(
            process_generation_task,
            task_id=task.id,
            project_id=request.project_id,
            task_type=request.type.value,
            template_config=request.template_config,
        )
        
        logger.info(
            "courseware_generation_started",
            extra={
                "user_id": user_id,
                "project_id": request.project_id,
                "task_id": task.id,
                "type": request.type.value,
            },
        )
        
        # TODO: 保存幂等性响应
        # if idempotency_key:
        #     await db_service.save_idempotency_response(idempotency_key, response)
        
        return GenerateResponse(
            task_id=task.id,
            status="pending",
            message="课件生成任务已创建",
        )
        
    except APIException as e:
        logger.error(
            f"Failed to generate courseware: {e.message}",
            extra={
                "user_id": user_id,
                "project_id": request.project_id,
                "error_code": e.error_code,
            },
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to generate courseware: {str(e)}",
            extra={"user_id": user_id, "project_id": request.project_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate courseware",
        )


async def process_generation_task(
    task_id: str,
    project_id: str,
    task_type: str,
    template_config: Optional[dict] = None,
):
    """
    后台任务：处理课件生成
    
    Args:
        task_id: 任务 ID
        project_id: 项目 ID
        task_type: 任务类型（pptx/docx/both）
        template_config: 模板配置
    """
    try:
        logger.info(
            "generation_task_processing_started",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "task_type": task_type,
            },
        )
        
        # 更新任务状态为 processing
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="processing",
            progress=10,
        )
        
        # TODO: 调用 AI Service 获取课件内容
        # courseware_content = await ai_service.generate_courseware_content(project_id)
        
        # TODO: 调用 GenerationService 生成文件
        # from services.generation_service import generation_service
        # output_urls = {}
        # 
        # if task_type in ["pptx", "both"]:
        #     pptx_path = await generation_service.generate_pptx(courseware_content, task_id)
        #     output_urls["pptx"] = f"/api/v1/files/download/{task_id}/pptx"
        #     await db_service.update_generation_task_status(task_id, "processing", 50)
        # 
        # if task_type in ["docx", "both"]:
        #     docx_path = await generation_service.generate_docx(courseware_content, task_id)
        #     output_urls["docx"] = f"/api/v1/files/download/{task_id}/docx"
        #     await db_service.update_generation_task_status(task_id, "processing", 90)
        
        # TEMPORARY: Mock 成功响应
        import json
        output_urls = {
            "pptx": f"/api/v1/files/download/{task_id}/pptx",
            "docx": f"/api/v1/files/download/{task_id}/docx",
        }
        
        # 更新任务状态为 completed
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="completed",
            progress=100,
            output_urls=json.dumps(output_urls),
        )
        
        logger.info(
            "generation_task_completed",
            extra={
                "task_id": task_id,
                "project_id": project_id,
                "output_urls": output_urls,
            },
        )
        
    except Exception as e:
        logger.error(
            f"Generation task failed: {str(e)}",
            extra={"task_id": task_id, "project_id": project_id},
            exc_info=True,
        )
        
        # 更新任务状态为 failed
        await db_service.update_generation_task_status(
            task_id=task_id,
            status="failed",
            error_message=str(e),
        )


@router.get("/status/{task_id}")
async def get_generation_status(
    task_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    查询生成状态
    
    查询指定任务的生成状态、进度和结果。

    Args:
        task_id: 任务ID
        user_id: 当前用户ID（从认证依赖获取）

    Returns:
        生成任务状态信息

    Raises:
        HTTPException: 任务不存在或无权限访问时抛出
    """
    try:
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
                message="无权限访问此任务",
            )
        
        logger.info(
            "generation_status_checked",
            extra={"user_id": user_id, "task_id": task_id, "status": task.status},
        )
        
        # 解析输出 URLs
        import json
        result = None
        if task.outputUrls:
            try:
                result = json.loads(task.outputUrls)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse outputUrls for task {task_id}")
        
        return success_response(
            data={
                "task_id": task.id,
                "status": task.status,
                "progress": task.progress,
                "result": result,
                "error": task.errorMessage,
                "created_at": task.createdAt.isoformat(),
                "updated_at": task.updatedAt.isoformat(),
            },
            message="获取生成状态成功",
        )
        
    except APIException as e:
        logger.error(
            f"Failed to get generation status: {e.message}",
            extra={"user_id": user_id, "task_id": task_id, "error_code": e.error_code},
        )
        raise
    except Exception as e:
        logger.error(
            f"Failed to get generation status: {str(e)}",
            extra={"user_id": user_id, "task_id": task_id},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get generation status",
        )
