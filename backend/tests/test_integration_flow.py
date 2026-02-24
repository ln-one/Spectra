"""
完整流程、性能和错误场景集成测试

测试端到端生成流程、性能指标和错误处理

运行测试:
    pytest tests/test_integration_flow.py -v -m integration
"""

import pytest
from pathlib import Path
import time

from services.generation import GenerationService, CoursewareContent
from tests.integration_fixtures import (
    integration_output_dir,
    sample_courseware_content,
    simple_courseware_content
)


pytestmark = pytest.mark.integration


class TestFullGenerationFlow:
    """测试完整生成流程"""

    @pytest.mark.asyncio
    async def test_generate_both_pptx_and_docx(
        self,
        integration_output_dir,
        sample_courseware_content
    ):
        """测试同时生成 PPTX 和 DOCX"""
        service = GenerationService(output_dir=str(integration_output_dir))
        task_id = "integration-test-full"
        
        # 生成 PPTX
        pptx_path = await service.generate_pptx(
            sample_courseware_content,
            task_id
        )
        
        # 生成 DOCX
        docx_path = await service.generate_docx(
            sample_courseware_content,
            task_id
        )
        
        # 验证两个文件都存在
        assert Path(pptx_path).exists()
        assert Path(docx_path).exists()
        
        # 验证文件大小
        assert Path(pptx_path).stat().st_size > 0
        assert Path(docx_path).stat().st_size > 0
        
        print(f"✓ 完整流程测试成功:")
        print(f"  PPTX: {pptx_path} ({Path(pptx_path).stat().st_size} bytes)")
        print(f"  DOCX: {docx_path} ({Path(docx_path).stat().st_size} bytes)")

    @pytest.mark.asyncio
    async def test_generate_multiple_tasks(
        self,
        integration_output_dir,
        simple_courseware_content
    ):
        """测试生成多个任务"""
        service = GenerationService(output_dir=str(integration_output_dir))
        
        # 生成 3 个不同的课件
        tasks = []
        for i in range(3):
            pptx_path = await service.generate_pptx(
                simple_courseware_content,
                f"integration-test-multi-{i}"
            )
            tasks.append(pptx_path)
        
        # 验证所有文件都存在
        for path in tasks:
            assert Path(path).exists()
            assert Path(path).stat().st_size > 0
        
        print(f"✓ 多任务生成测试成功: {len(tasks)} 个文件")


class TestPerformance:
    """测试性能"""

    @pytest.mark.asyncio
    async def test_simple_pptx_generation_time(
        self,
        integration_output_dir,
        simple_courseware_content
    ):
        """测试简单 PPTX 生成时间"""
        service = GenerationService(output_dir=str(integration_output_dir))
        
        start = time.time()
        await service.generate_pptx(
            simple_courseware_content,
            "integration-test-perf"
        )
        duration = time.time() - start
        
        # 简单课件应该在 30 秒内完成
        assert duration < 30, f"生成时间过长: {duration}s"
        
        print(f"✓ 生成时间: {duration:.2f}s")

    @pytest.mark.asyncio
    async def test_complex_pptx_generation_time(
        self,
        integration_output_dir,
        sample_courseware_content
    ):
        """测试复杂 PPTX 生成时间"""
        service = GenerationService(output_dir=str(integration_output_dir))
        
        start = time.time()
        await service.generate_pptx(
            sample_courseware_content,
            "integration-test-perf-complex"
        )
        duration = time.time() - start
        
        # 复杂课件应该在 60 秒内完成
        assert duration < 60, f"生成时间过长: {duration}s"
        
        print(f"✓ 复杂课件生成时间: {duration:.2f}s")


class TestErrorScenarios:
    """测试错误场景"""

    @pytest.mark.asyncio
    async def test_invalid_markdown_handling(
        self,
        integration_output_dir
    ):
        """测试处理无效 Markdown"""
        service = GenerationService(output_dir=str(integration_output_dir))
        
        # 创建包含潜在问题的内容
        content = CoursewareContent(
            title="测试",
            markdown_content="# 标题\n\n```\n未闭合的代码块",
            lesson_plan_markdown="# 教案"
        )
        
        # 即使 Markdown 有问题，也应该能生成（Marp 会尽力处理）
        pptx_path = await service.generate_pptx(content, "integration-test-invalid")
        
        # 文件应该存在（即使可能有警告）
        assert Path(pptx_path).exists()
        print(f"✓ 处理了潜在问题的 Markdown")
