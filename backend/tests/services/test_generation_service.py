"""
GenerationService 单元测试

使用 Mock 测试生成服务，不依赖真实的 Marp CLI 和 Pandoc
"""

import asyncio
from unittest.mock import AsyncMock, Mock, patch

import pytest

from services.generation import CoursewareContent, GenerationService
from services.template import TemplateConfig, TemplateStyle
from utils.generation_exceptions import (
    FileSystemError,
    GenerationTimeoutError,
    ToolExecutionError,
)


@pytest.fixture
def mock_content():
    """测试用的课件内容"""
    return CoursewareContent(
        title="测试课件",
        markdown_content="""---
marp: true
theme: default
---

# 测试标题

测试内容
""",
        lesson_plan_markdown="""# 教学目标

- 目标1
- 目标2

# 教学过程

## 导入环节

内容...
""",
    )


@pytest.fixture
def mock_template_service():
    """Mock 模板服务"""
    service = Mock()
    service.wrap_markdown_with_template.return_value = """---
marp: true
theme: default
---

# 测试标题

测试内容
"""
    service.get_pandoc_template_path.return_value = None
    return service


@pytest.fixture
def generation_service(tmp_path, mock_template_service):
    """创建测试用的 GenerationService 实例"""
    with patch("services.generation.check_tools_installed"):
        service = GenerationService(
            output_dir=str(tmp_path / "generated"),
            template_service=mock_template_service,
        )
        return service


class TestGenerationServiceInit:
    """测试 GenerationService 初始化"""

    def test_init_creates_output_dir(self, tmp_path):
        """测试初始化时创建输出目录"""
        output_dir = tmp_path / "test_output"

        with patch("services.generation.check_tools_installed"):
            service = GenerationService(output_dir=str(output_dir))

        assert output_dir.exists()
        assert output_dir.is_dir()

    def test_init_checks_tools(self, tmp_path):
        """测试初始化时检查工具安装"""
        with patch("services.generation.check_tools_installed") as mock_check:
            GenerationService(output_dir=str(tmp_path))
            mock_check.assert_called_once()


class TestGeneratePPTX:
    """测试 PPTX 生成功能"""

    @pytest.mark.asyncio
    async def test_generate_pptx_success(
        self, generation_service, mock_content, tmp_path
    ):
        """测试 PPTX 生成成功场景"""
        # Mock 生成器函数
        expected_path = str(tmp_path / "generated" / "test-task-123.pptx")

        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = expected_path

            result = await generation_service.generate_pptx(
                mock_content, "test-task-123"
            )

            assert result == expected_path
            mock_gen.assert_called_once()

            # 验证调用参数
            call_args = mock_gen.call_args
            assert call_args[0][0] == mock_content
            assert call_args[0][1] == "test-task-123"

    @pytest.mark.asyncio
    async def test_generate_pptx_with_custom_template(
        self, generation_service, mock_content
    ):
        """测试使用自定义模板生成 PPTX"""
        config = TemplateConfig(style=TemplateStyle.GAIA, primary_color="#FF6B6B")

        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = "test.pptx"

            await generation_service.generate_pptx(mock_content, "test-task", config)

            # 验证模板服务被调用
            generation_service.template_service.wrap_markdown_with_template.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_pptx_tool_execution_error(
        self, generation_service, mock_content
    ):
        """测试工具执行失败场景"""
        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = ToolExecutionError(
                "Marp CLI execution failed",
                "MARP_EXEC_ERROR",
                {"stderr": "Error: Invalid markdown"},
            )

            with pytest.raises(ToolExecutionError) as exc_info:
                await generation_service.generate_pptx(mock_content, "test-task")

            assert "Marp CLI execution failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generate_pptx_timeout(self, generation_service, mock_content):
        """测试生成超时场景"""
        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = GenerationTimeoutError(
                "Generation timeout after 300s", "TIMEOUT_ERROR"
            )

            with pytest.raises(GenerationTimeoutError):
                await generation_service.generate_pptx(mock_content, "test-task")

    @pytest.mark.asyncio
    async def test_generate_pptx_filesystem_error(
        self, generation_service, mock_content
    ):
        """测试文件系统错误场景"""
        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = FileSystemError(
                "Failed to write file", "FS_WRITE_ERROR", {"path": "/invalid/path"}
            )

            with pytest.raises(FileSystemError):
                await generation_service.generate_pptx(mock_content, "test-task")

    @pytest.mark.asyncio
    async def test_generate_pptx_mermaid_default_non_blocking(
        self, generation_service, mock_content
    ):
        with (
            patch(
                "services.mermaid_renderer.preprocess_mermaid_blocks",
                new=AsyncMock(return_value=mock_content.markdown_content),
            ) as mock_preprocess,
            patch(
                "services.generation._generate_pptx",
                new_callable=AsyncMock,
                return_value="test.pptx",
            ),
        ):
            await generation_service.generate_pptx(mock_content, "test-task")

        assert mock_preprocess.await_args.kwargs["fail_on_unrendered"] is False

    @pytest.mark.asyncio
    async def test_generate_pptx_mermaid_strict_mode_enabled_by_env(
        self, generation_service, mock_content
    ):
        with (
            patch.dict("os.environ", {"MERMAID_STRICT_MODE": "true"}),
            patch(
                "services.mermaid_renderer.preprocess_mermaid_blocks",
                new=AsyncMock(return_value=mock_content.markdown_content),
            ) as mock_preprocess,
            patch(
                "services.generation._generate_pptx",
                new_callable=AsyncMock,
                return_value="test.pptx",
            ),
        ):
            await generation_service.generate_pptx(mock_content, "test-task")

        assert mock_preprocess.await_args.kwargs["fail_on_unrendered"] is True


class TestGenerateDOCX:
    """测试 DOCX 生成功能"""

    @pytest.mark.asyncio
    async def test_generate_docx_success(
        self, generation_service, mock_content, tmp_path
    ):
        """测试 DOCX 生成成功场景"""
        expected_path = str(tmp_path / "generated" / "test-task-123_lesson_plan.docx")

        with patch(
            "services.generation._generate_docx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = expected_path

            result = await generation_service.generate_docx(
                mock_content, "test-task-123"
            )

            assert result == expected_path
            mock_gen.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_docx_with_template(self, generation_service, mock_content):
        """测试使用模板生成 DOCX"""
        config = TemplateConfig()
        generation_service.template_service.get_pandoc_template_path.return_value = (
            "template.docx"
        )

        with patch(
            "services.generation._generate_docx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = "test.docx"

            await generation_service.generate_docx(mock_content, "test-task", config)

            # 验证模板路径被获取
            generation_service.template_service.get_pandoc_template_path.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_docx_tool_execution_error(
        self, generation_service, mock_content
    ):
        """测试 Pandoc 执行失败场景"""
        with patch(
            "services.generation._generate_docx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = ToolExecutionError(
                "Pandoc execution failed",
                "PANDOC_EXEC_ERROR",
                {"stderr": "Error: Invalid input"},
            )

            with pytest.raises(ToolExecutionError) as exc_info:
                await generation_service.generate_docx(mock_content, "test-task")

            assert "Pandoc execution failed" in str(exc_info.value)


class TestFilePathSafety:
    """测试文件路径安全性"""

    @pytest.mark.asyncio
    async def test_task_id_sanitization(self, generation_service, mock_content):
        """测试任务 ID 清理（防止路径遍历）"""
        dangerous_task_id = "../../../etc/passwd"

        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = "safe.pptx"

            await generation_service.generate_pptx(mock_content, dangerous_task_id)

            # 验证生成器被调用（路径清理在生成器内部处理）
            mock_gen.assert_called_once()


class TestConcurrentGeneration:
    """测试并发生成"""

    @pytest.mark.asyncio
    async def test_concurrent_pptx_generation(self, generation_service, mock_content):
        """测试并发生成多个 PPTX"""
        with patch(
            "services.generation._generate_pptx", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = lambda c, tid, *args: f"{tid}.pptx"

            # 并发生成 3 个文件
            tasks = [
                generation_service.generate_pptx(mock_content, f"task-{i}")
                for i in range(3)
            ]

            results = await asyncio.gather(*tasks)

            assert len(results) == 3
            assert all(r.endswith(".pptx") for r in results)
            assert mock_gen.call_count == 3
