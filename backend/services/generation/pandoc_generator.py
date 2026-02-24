"""
课件生成服务 - Pandoc 生成器
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

try:
    from .tool_checker import check_pandoc_installed
    from .types import CoursewareContent
    from ...utils.generation_exceptions import (
        ToolNotFoundError,
        ToolExecutionError,
        FileSystemError,
        TimeoutError as GenerationTimeoutError
    )
    from ...utils.file_utils import (
        get_generation_output_path,
        get_temp_file_path,
        ensure_directory_exists,
        validate_file_exists,
        cleanup_file
    )
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.generation.tool_checker import check_pandoc_installed
    from services.generation.types import CoursewareContent
    from utils.generation_exceptions import (
        ToolNotFoundError,
        ToolExecutionError,
        FileSystemError,
        TimeoutError as GenerationTimeoutError
    )
    from utils.file_utils import (
        get_generation_output_path,
        get_temp_file_path,
        ensure_directory_exists,
        validate_file_exists,
        cleanup_file
    )

logger = logging.getLogger(__name__)


async def call_pandoc(
    input_file: Path,
    output_file: Path,
    reference_doc: Optional[Path] = None,
    timeout: int = 300
) -> tuple[bytes, bytes]:
    """
    调用 Pandoc 执行转换
    
    Args:
        input_file: 输入 Markdown 文件路径
        output_file: 输出 DOCX 文件路径
        reference_doc: 参考模板文档路径（可选）
        timeout: 超时时间（秒）
        
    Returns:
        tuple[bytes, bytes]: (stdout, stderr)
        
    Raises:
        ToolNotFoundError: 工具未安装
        ToolExecutionError: 工具执行失败
        GenerationTimeoutError: 执行超时
    """
    # 先检查工具是否安装
    try:
        check_pandoc_installed()
    except ToolNotFoundError:
        raise
    
    cmd = ["pandoc", str(input_file), "-o", str(output_file)]
    
    # 如果提供了参考模板，添加参数
    if reference_doc and reference_doc.exists():
        cmd.extend(["--reference-doc", str(reference_doc)])
    
    logger.debug(f"Executing Pandoc: {' '.join(cmd)}")
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # 添加超时控制
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"Pandoc execution timeout after {timeout}s")
            raise GenerationTimeoutError("Pandoc execution", timeout)
        
        if process.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='replace')
            logger.error(f"Pandoc failed with return code {process.returncode}: {error_msg}")
            raise ToolExecutionError("Pandoc", error_msg, process.returncode)
        
        logger.debug(f"Pandoc executed successfully")
        return stdout, stderr
        
    except FileNotFoundError:
        logger.error("Pandoc not found in PATH")
        raise ToolNotFoundError(
            "Pandoc",
            "brew install pandoc (macOS) or apt-get install pandoc (Linux)"
        )


async def generate_docx(
    content: CoursewareContent,
    task_id: str,
    output_dir: Path,
    reference_doc: Optional[Path] = None
) -> str:
    """
    生成 DOCX 文件（使用 Pandoc）
    
    Args:
        content: 课件内容
        task_id: 任务ID
        output_dir: 输出目录
        reference_doc: Pandoc 参考模板（可选）
        
    Returns:
        str: 生成的文件路径
        
    Raises:
        ToolNotFoundError: 工具未安装
        ToolExecutionError: 工具执行失败
        FileSystemError: 文件系统错误
        GenerationTimeoutError: 执行超时
    """
    logger.info(f"[Task: {task_id}] Starting DOCX generation")
    
    # 确保输出目录存在
    ensure_directory_exists(output_dir)
    
    # 使用安全的路径管理 - 为教案文件添加特殊后缀
    markdown_file = output_dir / f"{task_id}_lesson_plan_temp.md"
    output_file = output_dir / f"{task_id}_lesson_plan.docx"
    
    try:
        # 1. 写入 Markdown 文件
        try:
            markdown_file.write_text(content.lesson_plan_markdown, encoding="utf-8")
            logger.debug(f"[Task: {task_id}] Lesson plan markdown written to {markdown_file} ({len(content.lesson_plan_markdown)} bytes)")
        except Exception as e:
            raise FileSystemError("write", str(markdown_file), str(e))
        
        # 2. 调用 Pandoc
        if reference_doc:
            logger.debug(f"[Task: {task_id}] Using Pandoc template: {reference_doc}")
        
        logger.info(f"[Task: {task_id}] Calling Pandoc")
        await call_pandoc(markdown_file, output_file, reference_doc)
        
        # 3. 验证输出文件（使用安全的验证函数）
        if not validate_file_exists(output_file, min_size=1):
            raise FileSystemError("verify", str(output_file), "Output file not created or is empty")
        
        file_size = output_file.stat().st_size
        logger.info(f"[Task: {task_id}] DOCX generated successfully: {output_file} ({file_size} bytes)")
        
        # 4. 清理临时文件（使用安全的清理函数）
        if cleanup_file(markdown_file):
            logger.debug(f"[Task: {task_id}] Cleaned up temporary file: {markdown_file}")
        else:
            logger.warning(f"[Task: {task_id}] Failed to cleanup temp file {markdown_file}")
        
        return str(output_file)
        
    except (ToolNotFoundError, ToolExecutionError, FileSystemError, GenerationTimeoutError) as e:
        logger.error(f"[Task: {task_id}] Generation failed: {e.error_code} - {e.message}",
                    exc_info=True,
                    extra={"task_id": task_id, "error_details": e.details})
        # 清理临时文件
        cleanup_file(markdown_file)
        raise
    except Exception as e:
        logger.error(f"[Task: {task_id}] Unexpected error during DOCX generation: {str(e)}",
                    exc_info=True,
                    extra={"task_id": task_id})
        # 清理临时文件
        cleanup_file(markdown_file)
        raise FileSystemError("generate_docx", str(output_file), str(e))
