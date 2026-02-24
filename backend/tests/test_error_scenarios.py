"""
错误场景测试

测试工具检测、服务错误处理等实际错误场景
"""

from unittest.mock import AsyncMock, patch

import pytest

from services.generation import CoursewareContent, GenerationService
from services.generation.tool_checker import check_tools_installed
from utils.generation_exceptions import (
    FileSystemError,
    ToolExecutionError,
    ToolNotFoundError,
)


class TestToolCheckerErrors:
    """测试工具检测错误"""

    def test_check_marp_installed_not_found(self):
        """测试 Marp 未安装检测"""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = FileNotFoundError()

            with pytest.raises(ToolNotFoundError) as exc_info:
                from services.generation.tool_checker import check_marp_installed

                check_marp_installed()

            assert "marp" in str(exc_info.value).lower()

    def test_check_pandoc_installed_not_found(self):
        """测试 Pandoc 未安装检测"""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = FileNotFoundError()

            with pytest.raises(ToolNotFoundError) as exc_info:
                from services.generation.tool_checker import check_pandoc_installed

                check_pandoc_installed()

            assert "pandoc" in str(exc_info.value).lower()

    def test_check_tools_all_installed(self):
        """测试所有工具已安装"""
        with patch(
            "services.generation.tool_checker.check_marp_installed"
        ) as mock_marp:
            with patch(
                "services.generation.tool_checker.check_pandoc_installed"
            ) as mock_pandoc:
                mock_marp.return_value = True
                mock_pandoc.return_value = True

                # 不应该抛出异常
                check_tools_installed()


class TestGenerationServiceErrorHandling:
    """测试 GenerationService 的错误处理"""

    @pytest.fixture
    def mock_content(self):
        """测试内容"""
        return CoursewareContent(
            title="测试", markdown_content="# 测试", lesson_plan_markdown="# 教案"
        )

    @pytest.mark.asyncio
    async def test_service_init_tool_not_found(self, tmp_path):
        """测试服务初始化时工具未找到"""
        with patch("services.generation.check_tools_installed") as mock_check:
            mock_check.side_effect = ToolNotFoundError("marp")

            with pytest.raises(ToolNotFoundError):
                GenerationService(output_dir=str(tmp_path))

    @pytest.mark.asyncio
    async def test_generate_pptx_tool_execution_error(self, tmp_path, mock_content):
        """测试 PPTX 生成时工具执行错误"""
        with patch("services.generation.check_tools_installed"):
            service = GenerationService(output_dir=str(tmp_path))

        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = ToolExecutionError(
                "marp", "Error: Invalid markdown syntax", 1
            )

            with pytest.raises(ToolExecutionError) as exc_info:
                await service.generate_pptx(mock_content, "test-task")

            assert exc_info.value.details["tool"] == "marp"
            assert "Invalid markdown" in exc_info.value.details["stderr"]

    @pytest.mark.asyncio
    async def test_generate_docx_filesystem_error(self, tmp_path, mock_content):
        """测试 DOCX 生成时文件系统错误"""
        with patch("services.generation.check_tools_installed"):
            service = GenerationService(output_dir=str(tmp_path))

        with patch(
            "services.generation._generate_docx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = FileSystemError(
                "write", "/invalid/path/file.docx", "Permission denied"
            )

            with pytest.raises(FileSystemError) as exc_info:
                await service.generate_docx(mock_content, "test-task")

            assert exc_info.value.details["operation"] == "write"
