"""
端到端测试：AI Service + Generation Service 集成

测试从 AI 生成内容到文件生成的完整流程
"""

import os
from pathlib import Path

import pytest

from schemas.generation import TemplateConfig, TemplateStyle
from services.ai import ai_service
from services.generation import generation_service
from utils.exceptions import ErrorCode, ExternalServiceException


@pytest.fixture(autouse=True)
def _stabilize_ai_timeouts(monkeypatch):
    monkeypatch.setattr(
        ai_service,
        "request_timeout_seconds",
        max(getattr(ai_service, "request_timeout_seconds", 45.0), 90.0),
    )
    monkeypatch.setattr(
        ai_service,
        "chat_request_timeout_seconds",
        max(getattr(ai_service, "chat_request_timeout_seconds", 90.0), 90.0),
    )


@pytest.fixture(autouse=True)
def _skip_real_ai_integration_without_dashscope_key(request):
    if (
        request.node.get_closest_marker("integration")
        and not os.getenv("DASHSCOPE_API_KEY", "").strip()
    ):
        pytest.skip("DASHSCOPE_API_KEY not set; skipping real AI integration test")


class TestE2EGenerationWithAI:
    """端到端生成测试"""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_full_generation_flow_with_ai(self):
        """测试完整的生成流程：AI 生成内容 → 文件生成"""
        # 1. 使用 AI Service 生成课件内容
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_001",
            user_requirements="Python 函数编程基础",
            template_style="default",
        )

        # 验证 AI 生成的内容
        assert courseware_content.title
        assert courseware_content.markdown_content
        assert courseware_content.lesson_plan_markdown

        # 2. 使用 Generation Service 生成 PPTX
        task_id = "e2e-test-001"
        template_config = TemplateConfig(style=TemplateStyle.DEFAULT)

        pptx_path = await generation_service.generate_pptx(
            courseware_content,
            task_id,
            template_config,
        )

        # 验证 PPTX 文件生成
        assert pptx_path
        assert Path(pptx_path).exists()
        assert Path(pptx_path).suffix == ".pptx"
        assert Path(pptx_path).stat().st_size > 0

        # 3. 使用 Generation Service 生成 DOCX
        docx_path = await generation_service.generate_docx(
            courseware_content,
            task_id,
            template_config,
        )

        # 验证 DOCX 文件生成
        assert docx_path
        assert Path(docx_path).exists()
        assert Path(docx_path).suffix == ".docx"
        assert Path(docx_path).stat().st_size > 0

        # 清理生成的文件
        Path(pptx_path).unlink(missing_ok=True)
        Path(docx_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_generation_with_different_templates(self):
        """测试使用不同模板风格生成"""
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_002",
            user_requirements="数据结构与算法",
            template_style="gaia",
        )

        task_id = "e2e-test-002"
        template_config = TemplateConfig(
            style=TemplateStyle.GAIA,
            primary_color="#FF6B6B",
            enable_pagination=True,
        )

        pptx_path = await generation_service.generate_pptx(
            courseware_content,
            task_id,
            template_config,
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0

        # 清理
        Path(pptx_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_generation_with_empty_requirements(self):
        """测试空需求的完整流程"""
        # AI Service 应该返回 fallback 内容
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_003",
            user_requirements="",
            template_style="default",
        )

        # 即使是 fallback 内容，也应该能成功生成文件
        task_id = "e2e-test-003"

        pptx_path = await generation_service.generate_pptx(
            courseware_content,
            task_id,
        )

        docx_path = await generation_service.generate_docx(
            courseware_content,
            task_id,
        )

        assert Path(pptx_path).exists()
        assert Path(docx_path).exists()

        # 清理
        Path(pptx_path).unlink(missing_ok=True)
        Path(docx_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_generation_with_code_blocks(self):
        """测试包含代码块的课件生成"""
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_004",
            user_requirements="Python 面向对象编程：类和对象",
            template_style="default",
        )

        task_id = "e2e-test-004"

        pptx_path = await generation_service.generate_pptx(
            courseware_content,
            task_id,
        )

        # 验证文件生成成功
        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0

        # 清理
        Path(pptx_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_ai_service_error_handling(self, monkeypatch):
        """测试 AI Service 错误处理（本地模拟上游失败，避免真实 provider 依赖）"""

        async def _boom_generate(*args, **kwargs):
            raise ExternalServiceException(
                message="upstream auth failed",
                status_code=503,
                error_code=ErrorCode.UPSTREAM_AUTH_ERROR,
                details={"provider": "test"},
                retryable=False,
            )

        monkeypatch.setattr(ai_service, "generate", _boom_generate)
        monkeypatch.setattr(
            "services.courseware_ai.generation.ALLOW_COURSEWARE_FALLBACK",
            True,
        )

        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_error",
            user_requirements="测试错误处理",
            template_style="default",
        )

        # 应该返回有效的内容（可能是 fallback）
        assert courseware_content.title
        assert courseware_content.markdown_content
        assert courseware_content.lesson_plan_markdown

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_multiple_generations_same_content(self):
        """测试同一内容多次生成"""
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_005",
            user_requirements="Web 前端开发基础",
            template_style="default",
        )

        # 生成多个文件
        task_ids = ["e2e-test-005-1", "e2e-test-005-2"]
        generated_files = []

        for task_id in task_ids:
            pptx_path = await generation_service.generate_pptx(
                courseware_content,
                task_id,
            )
            generated_files.append(pptx_path)
            assert Path(pptx_path).exists()

        # 验证文件名不同
        assert generated_files[0] != generated_files[1]

        # 清理
        for file_path in generated_files:
            Path(file_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_generation_performance(self):
        """测试生成性能"""
        import time

        start_time = time.time()

        # 生成内容
        courseware_content = await ai_service.generate_courseware_content(
            project_id="e2e_test_perf",
            user_requirements="机器学习入门",
            template_style="default",
        )

        ai_time = time.time() - start_time

        # 生成文件
        gen_start = time.time()
        task_id = "e2e-test-perf"

        pptx_path = await generation_service.generate_pptx(
            courseware_content,
            task_id,
        )

        docx_path = await generation_service.generate_docx(
            courseware_content,
            task_id,
        )

        gen_time = time.time() - gen_start
        total_time = time.time() - start_time

        print("\n性能统计:")
        print(f"  AI 生成时间: {ai_time:.2f}s")
        print(f"  文件生成时间: {gen_time:.2f}s")
        print(f"  总时间: {total_time:.2f}s")

        # 验证文件生成成功
        assert Path(pptx_path).exists()
        assert Path(docx_path).exists()

        # 清理
        Path(pptx_path).unlink(missing_ok=True)
        Path(docx_path).unlink(missing_ok=True)
