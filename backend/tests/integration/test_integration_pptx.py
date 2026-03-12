"""
PPTX 生成集成测试

测试 Marp CLI 生成 PPTX 的完整流程

运行前确保 Marp CLI 已安装:
    npm install -g @marp-team/marp-cli

运行测试:
    pytest tests/test_integration_pptx.py -v -m integration
"""

from pathlib import Path

import pytest

from services.generation import GenerationService
from services.template import TemplateConfig, TemplateStyle

pytestmark = pytest.mark.integration


class TestPPTXGeneration:
    """测试 PPTX 生成"""

    @pytest.mark.asyncio
    async def test_generate_pptx_default_template(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试使用默认模板生成 PPTX"""
        service = GenerationService(output_dir=str(integration_output_dir))

        pptx_path = await service.generate_pptx(
            simple_courseware_content, "integration-test-default"
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0
        assert pptx_path.endswith(".pptx")

        print(f"✓ 生成成功: {pptx_path}")
        print(f"  文件大小: {Path(pptx_path).stat().st_size} bytes")

    @pytest.mark.asyncio
    async def test_generate_pptx_gaia_template(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试使用 GAIA 模板生成 PPTX"""
        service = GenerationService(output_dir=str(integration_output_dir))
        config = TemplateConfig(style=TemplateStyle.GAIA, primary_color="#FF6B6B")

        pptx_path = await service.generate_pptx(
            simple_courseware_content, "integration-test-gaia", config
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0
        print(f"✓ GAIA 模板生成成功: {pptx_path}")

    @pytest.mark.asyncio
    async def test_generate_pptx_uncover_template(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试使用 UNCOVER 模板生成 PPTX"""
        service = GenerationService(output_dir=str(integration_output_dir))
        config = TemplateConfig(style=TemplateStyle.UNCOVER, primary_color="#4ECDC4")

        pptx_path = await service.generate_pptx(
            simple_courseware_content, "integration-test-uncover", config
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0
        print(f"✓ UNCOVER 模板生成成功: {pptx_path}")

    @pytest.mark.asyncio
    async def test_generate_pptx_with_code_blocks(
        self, integration_output_dir, sample_courseware_content
    ):
        """测试生成包含代码块的 PPTX"""
        service = GenerationService(output_dir=str(integration_output_dir))

        pptx_path = await service.generate_pptx(
            sample_courseware_content, "integration-test-code"
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0
        print(f"✓ 包含代码块的 PPTX 生成成功: {pptx_path}")

    @pytest.mark.asyncio
    async def test_generate_pptx_with_custom_options(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试使用自定义选项生成 PPTX"""
        service = GenerationService(output_dir=str(integration_output_dir))
        config = TemplateConfig(
            style=TemplateStyle.DEFAULT,
            primary_color="#9B59B6",
            enable_pagination=True,
            enable_header=True,
            enable_footer=True,
        )

        pptx_path = await service.generate_pptx(
            simple_courseware_content, "integration-test-custom", config
        )

        assert Path(pptx_path).exists()
        assert Path(pptx_path).stat().st_size > 0
        print(f"✓ 自定义选项 PPTX 生成成功: {pptx_path}")

    @pytest.mark.asyncio
    async def test_pptx_file_is_valid(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试生成的 PPTX 文件是否有效"""
        service = GenerationService(output_dir=str(integration_output_dir))

        pptx_path = await service.generate_pptx(
            simple_courseware_content, "integration-test-valid"
        )

        # 验证文件是 ZIP 格式（PPTX 本质上是 ZIP）
        with open(pptx_path, "rb") as f:
            header = f.read(4)
            assert header[:2] == b"PK"

        print("✓ PPTX 文件格式有效")
