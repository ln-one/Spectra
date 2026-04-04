"""
课件生成服务 - Marp CLI 生成器
"""

import asyncio
import glob
import logging
import os
from pathlib import Path
from typing import Awaitable, Callable, Optional

try:
    from ...utils.file_utils import (
        cleanup_file,
        ensure_directory_exists,
        get_generation_output_path,
        get_temp_file_path,
        validate_file_exists,
    )
    from ...utils.generation_exceptions import (
        FileSystemError,
        GenerationTimeoutError,
        ToolExecutionError,
        ToolNotFoundError,
    )
    from .marp_document import (
        compose_single_slide_marp,
        normalize_marp_markdown,
        split_marp_document,
    )
    from .tool_checker import check_marp_installed, resolve_marp_command
    from .types import CoursewareContent
except ImportError:
    import sys

    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from services.generation.marp_document import (
        compose_single_slide_marp,
        normalize_marp_markdown,
        split_marp_document,
    )
    from services.generation.tool_checker import (
        check_marp_installed,
        resolve_marp_command,
    )
    from services.generation.types import CoursewareContent
    from utils.file_utils import (
        cleanup_file,
        ensure_directory_exists,
        get_generation_output_path,
        get_temp_file_path,
        validate_file_exists,
    )
    from utils.generation_exceptions import (
        FileSystemError,
        GenerationTimeoutError,
        ToolExecutionError,
        ToolNotFoundError,
    )

logger = logging.getLogger(__name__)


def _disable_frontmatter_paginate(frontmatter: str) -> str:
    raw = str(frontmatter or "").strip()
    if not raw:
        return "---\nmarp: true\npaginate: false\n---"

    lines = raw.splitlines()
    if len(lines) >= 2 and lines[0].strip() == "---" and lines[-1].strip() == "---":
        body_lines = lines[1:-1]
        replaced = False
        for index, line in enumerate(body_lines):
            if line.strip().startswith("paginate:"):
                body_lines[index] = "paginate: false"
                replaced = True
                break
        if not replaced:
            body_lines.append("paginate: false")
        return "---\n" + "\n".join(body_lines).strip() + "\n---"

    return raw


def _with_stream_page_number(
    *, frontmatter: str, style_blocks: str, slide_markdown: str, page_number: int
) -> str:
    pagination_override = (
        "<style>\n"
        "section::after {\n"
        "  content: none !important;\n"
        "  display: none !important;\n"
        "}\n"
        ".spectra-stream-page-number {\n"
        "  position: absolute;\n"
        "  right: 36px;\n"
        "  bottom: 18px;\n"
        "  font-size: 18px;\n"
        "  line-height: 1;\n"
        "  color: #9ca3af;\n"
        "  font-weight: 500;\n"
        "}\n"
        "</style>"
    )
    merged_style = "\n\n".join(
        part for part in (style_blocks.strip(), pagination_override) if part
    )
    numbered_slide_markdown = (
        f"{str(slide_markdown or '').strip()}\n\n"
        f'<div class="spectra-stream-page-number">{page_number}</div>'
    )
    return compose_single_slide_marp(
        _disable_frontmatter_paginate(frontmatter),
        merged_style,
        numbered_slide_markdown,
    )


def _resolve_browser_path() -> str | None:
    """
    解析可用的 Chrome/Chromium 路径。
    优先使用 CHROME_PATH；未设置时尝试常见安装位置。
    """
    env_path = os.getenv("CHROME_PATH")
    if env_path:
        return env_path

    candidates = [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    return None


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
    marp_cmd = resolve_marp_command()

    chrome_path = _resolve_browser_path()
    cmd = [
        marp_cmd,
        str(input_file),
        "--pptx",
        "--pptx-editable",
        "-o",
        str(output_file),
        "--allow-local-files",
    ]
    if chrome_path:
        cmd.extend(["--browser-path", chrome_path])
    logger.debug(f"Executing Marp CLI: {' '.join(cmd)}")

    async def _run(command: list[str]) -> tuple[bytes, bytes, int]:
        process = await asyncio.create_subprocess_exec(
            *command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        # 添加超时控制
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"Marp CLI execution timeout after {timeout}s")
            raise GenerationTimeoutError("Marp CLI execution", timeout)
        return stdout, stderr, process.returncode

    try:
        stdout, stderr, return_code = await _run(cmd)
        if return_code != 0:
            error_msg = stderr.decode("utf-8", errors="replace")

            # Marp editable mode 依赖 LibreOffice；缺失时自动降级重试，保障 MVP 可用
            normalized_error = " ".join(error_msg.lower().split())
            missing_soffice = "soffice" in normalized_error and (
                "could not be found" in normalized_error
                or "not found" in normalized_error
            )
            if "--pptx-editable" in cmd and missing_soffice:
                fallback_cmd = [x for x in cmd if x != "--pptx-editable"]
                logger.warning(
                    "Marp editable mode unavailable (soffice missing), "
                    "retrying without --pptx-editable"
                )
                stdout, stderr, return_code = await _run(fallback_cmd)
                if return_code == 0:
                    logger.debug("Marp CLI fallback without --pptx-editable succeeded")
                    return stdout, stderr
                error_msg = stderr.decode("utf-8", errors="replace")

            logger.error(f"Marp CLI failed with return code {return_code}: {error_msg}")
            raise ToolExecutionError("Marp CLI", error_msg, return_code)

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
    full_markdown = normalize_marp_markdown(full_markdown)

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


async def generate_slide_images(
    task_id: str,
    output_dir: Path,
    full_markdown: str,
    image_format: str = "png",
    on_image_generated: Optional[Callable[[int, str], Awaitable[None]]] = None,
    transform_slide_markdown: Optional[Callable[[int, str], Awaitable[str]]] = None,
) -> list[str]:
    """
    使用 Marp CLI 生成整套幻灯片页图。

    返回按页顺序排序后的本地图片路径列表。
    """

    logger.info(f"[Task: {task_id}] Starting slide image generation")
    ensure_directory_exists(output_dir)

    markdown_file = get_temp_file_path(output_dir, task_id, "md")
    image_ext = "jpg" if image_format == "jpeg" else image_format

    try:
        full_markdown = normalize_marp_markdown(full_markdown)
        chrome_path = _resolve_browser_path()
        marp_cmd = resolve_marp_command()
        if on_image_generated is not None:
            frontmatter, style_blocks, slide_contents = split_marp_document(
                full_markdown
            )
            image_paths: list[str] = []
            for page_index, slide_markdown in enumerate(slide_contents):
                slide_number = page_index + 1
                slide_markdown_file = output_dir / (
                    f"{task_id}_temp.slide-{slide_number:03d}.md"
                )
                output_file = (
                    output_dir / f"{task_id}_temp.{slide_number:03d}.{image_ext}"
                )
                cleanup_file(slide_markdown_file)
                cleanup_file(output_file)

                single_slide_markdown = _with_stream_page_number(
                    frontmatter=frontmatter,
                    style_blocks=style_blocks,
                    slide_markdown=slide_markdown,
                    page_number=slide_number,
                )
                if transform_slide_markdown is not None:
                    single_slide_markdown = await transform_slide_markdown(
                        page_index,
                        single_slide_markdown,
                    )
                slide_markdown_file.write_text(single_slide_markdown, encoding="utf-8")

                cmd = [
                    marp_cmd,
                    str(slide_markdown_file),
                    "--image",
                    image_format,
                    "-o",
                    str(output_file),
                    "--allow-local-files",
                ]
                if chrome_path:
                    cmd.extend(["--browser-path", chrome_path])

                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    _stdout, stderr = await asyncio.wait_for(
                        process.communicate(),
                        timeout=300,
                    )
                except asyncio.TimeoutError:
                    raise GenerationTimeoutError(
                        f"Marp slide image generation (slide {slide_number})",
                        300,
                    )
                finally:
                    cleanup_file(slide_markdown_file)

                if process.returncode != 0:
                    error_msg = stderr.decode("utf-8", errors="replace")
                    logger.error(
                        (
                            "Marp CLI streaming slide generation failed: "
                            "task=%s slide=%s return_code=%s error=%s"
                        ),
                        task_id,
                        slide_number,
                        process.returncode,
                        error_msg,
                    )
                    raise ToolExecutionError("Marp CLI", error_msg, process.returncode)

                if not validate_file_exists(output_file, min_size=1):
                    raise FileSystemError(
                        "generate_slide_images",
                        str(output_file),
                        "Slide image output not created",
                    )

                output_file_str = str(output_file)
                image_paths.append(output_file_str)
                try:
                    await on_image_generated(page_index, output_file_str)
                except Exception as callback_err:  # pragma: no cover
                    logger.warning(
                        "Slide image callback failed: task=%s index=%s error=%s",
                        task_id,
                        page_index,
                        callback_err,
                    )

            if not image_paths:
                raise FileSystemError(
                    "generate_slide_images",
                    str(output_dir),
                    "No image output created",
                )
            logger.info(
                "[Task: %s] Slide images generated successfully: %s pages",
                task_id,
                len(image_paths),
            )
            cleanup_file(markdown_file)
            return image_paths

        markdown_file.write_text(full_markdown, encoding="utf-8")
        output_stem = markdown_file.stem
        for stale_path in glob.glob(str(output_dir / f"{output_stem}.*.{image_ext}")):
            cleanup_file(Path(stale_path))

        cmd = [
            marp_cmd,
            str(markdown_file),
            "--images",
            image_format,
            "--allow-local-files",
        ]
        if chrome_path:
            cmd.extend(["--browser-path", chrome_path])

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="replace")
            logger.error(
                "Marp CLI slide image generation failed with return code %s: %s",
                process.returncode,
                error_msg,
            )
            raise ToolExecutionError("Marp CLI", error_msg, process.returncode)

        image_paths = sorted(
            str(path)
            for path in output_dir.glob(f"{output_stem}.*.{image_ext}")
            if validate_file_exists(path, min_size=1)
        )
        if not image_paths:
            raise FileSystemError(
                "generate_slide_images",
                str(output_dir),
                "No image output created",
            )
        logger.info(
            "[Task: %s] Slide images generated successfully: %s pages",
            task_id,
            len(image_paths),
        )

        cleanup_file(markdown_file)
        return image_paths
    except (
        ToolNotFoundError,
        ToolExecutionError,
        FileSystemError,
        GenerationTimeoutError,
    ):
        cleanup_file(markdown_file)
        raise
    except Exception as e:
        cleanup_file(markdown_file)
        raise FileSystemError("generate_slide_images", str(output_dir), str(e))
