"""
课件生成服务

负责将 AI 生成的 Markdown 内容转换为 PPT 和 Word 文件
技术栈：Marp CLI (Markdown → PPTX) + Pandoc (Markdown → DOCX)

设计原则：
- 高内聚：只负责文件生成，不涉及数据库/认证
- 低耦合：输入是 Markdown 字符串，可用 Mock 数据独立测试
- 接口契约：与成员 D 的 AI 服务约定 Markdown 格式
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class CoursewareContent(BaseModel):
    """
    课件内容 - A 与 D 的接口契约
    
    AI 服务（成员 D）输出标准 Markdown 格式
    生成服务（成员 A）将 Markdown 转换为文件
    """

    title: str
    markdown_content: str  # 完整的 Markdown 内容（包含 Marp frontmatter）
    lesson_plan_markdown: str  # 教案的 Markdown 内容


class GenerationService:
    """
    课件生成服务 - 高内聚、低耦合
    
    使用 Marp CLI 和 Pandoc 将 Markdown 转换为文件
    """

    def __init__(self, output_dir: str = "generated"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"GenerationService initialized with output_dir: {self.output_dir}")

    async def generate_pptx(self, content: CoursewareContent, task_id: str) -> str:
        """
        生成 PPTX 文件（使用 Marp CLI）

        Args:
            content: 课件内容（包含 Markdown）
            task_id: 任务ID（用于文件命名和日志）

        Returns:
            str: 生成的文件路径

        技术方案：
            1. 将 Markdown 写入临时文件
            2. 调用 Marp CLI: marp input.md -o output.pptx
            3. 返回生成的文件路径

        Marp Markdown 格式示例：
            ---
            marp: true
            theme: default
            paginate: true
            ---
            
            # 标题
            
            内容...
            
            ---
            
            # 第二页
            
            更多内容...
        """
        logger.info(f"Generating PPTX for task {task_id}")

        # 准备文件路径
        markdown_file = self.output_dir / f"{task_id}.md"
        output_file = self.output_dir / f"{task_id}.pptx"

        try:
            # 1. 写入 Markdown 文件
            markdown_file.write_text(content.markdown_content, encoding="utf-8")
            logger.debug(f"Markdown written to {markdown_file}")

            # 2. 调用 Marp CLI
            # TODO: Phase 2 实现真实调用
            # cmd = ["marp", str(markdown_file), "-o", str(output_file), "--allow-local-files"]
            # process = await asyncio.create_subprocess_exec(
            #     *cmd,
            #     stdout=asyncio.subprocess.PIPE,
            #     stderr=asyncio.subprocess.PIPE
            # )
            # stdout, stderr = await process.communicate()
            # if process.returncode != 0:
            #     raise Exception(f"Marp CLI failed: {stderr.decode()}")

            # STUB: Phase 1 返回模拟路径
            logger.warning(f"Marp CLI not called (Phase 1), returning stub path: {output_file}")
            
            # 清理临时 Markdown 文件
            # markdown_file.unlink()

            return str(output_file)

        except Exception as e:
            logger.error(f"Failed to generate PPTX: {str(e)}", exc_info=True)
            raise

    async def generate_docx(self, content: CoursewareContent, task_id: str) -> str:
        """
        生成 Word 教案文件（使用 Pandoc）

        Args:
            content: 课件内容（包含教案 Markdown）
            task_id: 任务ID

        Returns:
            str: 生成的文件路径

        技术方案：
            1. 将教案 Markdown 写入临时文件
            2. 调用 Pandoc: pandoc input.md -o output.docx
            3. 返回生成的文件路径

        Pandoc Markdown 格式示例：
            # 教学目标
            
            - 目标1
            - 目标2
            
            # 教学过程
            
            ## 导入环节（5分钟）
            
            内容...
        """
        logger.info(f"Generating DOCX for task {task_id}")

        # 准备文件路径
        markdown_file = self.output_dir / f"{task_id}_lesson_plan.md"
        output_file = self.output_dir / f"{task_id}_lesson_plan.docx"

        try:
            # 1. 写入 Markdown 文件
            markdown_file.write_text(content.lesson_plan_markdown, encoding="utf-8")
            logger.debug(f"Lesson plan markdown written to {markdown_file}")

            # 2. 调用 Pandoc
            # TODO: Phase 2 实现真实调用
            # cmd = ["pandoc", str(markdown_file), "-o", str(output_file)]
            # process = await asyncio.create_subprocess_exec(
            #     *cmd,
            #     stdout=asyncio.subprocess.PIPE,
            #     stderr=asyncio.subprocess.PIPE
            # )
            # stdout, stderr = await process.communicate()
            # if process.returncode != 0:
            #     raise Exception(f"Pandoc failed: {stderr.decode()}")

            # STUB: Phase 1 返回模拟路径
            logger.warning(f"Pandoc not called (Phase 1), returning stub path: {output_file}")
            
            # 清理临时 Markdown 文件
            # markdown_file.unlink()

            return str(output_file)

        except Exception as e:
            logger.error(f"Failed to generate DOCX: {str(e)}", exc_info=True)
            raise


# 全局服务实例
generation_service = GenerationService()
