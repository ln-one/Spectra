"""
课件生成服务 - Marp CLI 生成器
"""

import asyncio
import logging
from pathlib import Path

try:
    from ...utils.file_utils import (
        cleanup_file,
        ensure_directory_exists,
        get_generation_output_path,
        get_temp_file_path,
        validate_file_exists,
    )
    from ...utils.generation_exceptions import FileSystemError
    from ...utils.generation_exceptions import TimeoutError as GenerationTimeoutError
    from ...utils.generation_exceptions import ToolExecutionError, ToolNotFoundError
    from .tool_checker import check_marp_installed
    from .types import CoursewareContent
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.generation.tool_checker import check_marp_installed
    from services.generation.types import CoursewareContent
    from utils.file_utils import (
        cleanup_file,
        ensure_directory_exists,
        get_generation_output_path,
        get_temp_file_path,
        validate_file_exists,
    )
    from utils.generation_exceptions import FileSystemError
    from utils.generation_exceptions import TimeoutError as GenerationTimeoutError
    from utils.generation_exceptions import ToolExecutionError, ToolNotFoundError

logger = logging.getLogger(__name__)


async def call_marp_cli(
    input_file: Path, output_file: Path, timeout: int = 300
) -> tuple[bytes, bytes]:
    """
    调用 Marp CLI 执行转换

    Args:
        input_file: 输入 Markdown 文件路径
        output_file: 输出 PPTX 文件路径
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
        check_marp_installed()
    except ToolNotFoundError:
        raise

    cmd = ["marp", str(input_file), "-o", str(output_file), "--allow-local-files"]
    logger.debug(f"Executing Marp CLI: {' '.join(cmd)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        # 添加超时控制
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"Marp CLI execution timeout after {timeout}s")
            raise GenerationTimeoutError("Marp CLI execution", timeout)

        if process.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="replace")
            logger.error(
                f"Marp CLI failed with return code {process.returncode}: {error_msg}"
            )
            raise ToolExecutionError("Marp CLI", error_msg, process.returncode)

        logger.debug("Marp CLI executed successfully")
        return stdout, stderr

    except FileNotFoundError:
        logger.error("Marp CLI not found in PATH")
        raise ToolNotFoundError("Marp CLI", "npm install -g @marp-team/marp-cli")


async def generate_pptx(
    content: CoursewareContent, task_id: str, output_dir: Path, full_markdown: str
) -> str:
    """
    生成 PPTX 文件（使用 Marp CLI）

    Args:
        content: 课件内容
        task_id: 任务ID
        output_dir: 输出目录
        full_markdown: 完整的 Markdown 内容（已包装模板）

    Returns:
        str: 生成的文件路径

    Raises:
        ToolNotFoundError: 工具未安装
        ToolExecutionError: 工具执行失败
        FileSystemError: 文件系统错误
        GenerationTimeoutError: 执行超时
    """
    logger.info(f"[Task: {task_id}] Starting PPTX generation")

    # 确保输出目录存在
    ensure_directory_exists(output_dir)

    # 使用安全的路径管理
    markdown_file = get_temp_file_path(output_dir, task_id, "md")
    output_file = get_generation_output_path(output_dir, task_id, "pptx")

    try:
        # 1. 写入 Markdown 文件
        try:
            markdown_file.write_text(full_markdown, encoding="utf-8")
            logger.debug(
                f"[Task: {task_id}] Markdown written to {markdown_file} "
                f"({len(full_markdown)} bytes)"
            )
        except Exception as e:
            raise FileSystemError("write", str(markdown_file), str(e))

        # 2. 调用 Marp CLI
        logger.info(f"[Task: {task_id}] Calling Marp CLI")
        await call_marp_cli(markdown_file, output_file)

        # 3. 验证输出文件（使用安全的验证函数）
        if not validate_file_exists(output_file, min_size=1):
            raise FileSystemError(
                "verify", str(output_file), "Output file not created or is empty"
            )

        file_size = output_file.stat().st_size
        logger.info(
            f"[Task: {task_id}] PPTX generated successfully: {output_file} "
            f"({file_size} bytes)"
        )

        # 4. 清理临时文件（使用安全的清理函数）
        if cleanup_file(markdown_file):
            logger.debug(
                f"[Task: {task_id}] Cleaned up temporary file: {markdown_file}"
            )
        else:
            logger.warning(
                f"[Task: {task_id}] Failed to cleanup temp file {markdown_file}"
            )

        return str(output_file)

    except (
        ToolNotFoundError,
        ToolExecutionError,
        FileSystemError,
        GenerationTimeoutError,
    ) as e:
        logger.error(
            f"[Task: {task_id}] Generation failed: {e.error_code} - {e.message}",
            exc_info=True,
            extra={"task_id": task_id, "error_details": e.details},
        )
        # 清理临时文件
        cleanup_file(markdown_file)
        raise
    except Exception as e:
        logger.error(
            f"[Task: {task_id}] Unexpected error during PPTX generation: {str(e)}",
            exc_info=True,
            extra={"task_id": task_id},
        )
        # 清理临时文件
        cleanup_file(markdown_file)
        raise FileSystemError("generate_pptx", str(output_file), str(e))
