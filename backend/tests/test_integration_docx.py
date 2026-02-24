"""
DOCX 生成集成测试

测试 Pandoc 生成 DOCX 的完整流程

运行前确保 Pandoc 已安装:
    brew install pandoc (macOS)
    apt-get install pandoc (Linux)

运行测试:
    pytest tests/test_integration_docx.py -v -m integration
"""

from pathlib import Path

import pytest

from services.generation import GenerationService

pytestmark = pytest.mark.integration


class TestDOCXGeneration:
    """测试 DOCX 生成"""

    @pytest.mark.asyncio
    async def test_generate_docx_basic(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试基础 DOCX 生成"""
        service = GenerationService(output_dir=str(integration_output_dir))

        docx_path = await service.generate_docx(
            simple_courseware_content, "integration-test-basic"
        )

        assert Path(docx_path).exists()
        assert Path(docx_path).stat().st_size > 0
        assert docx_path.endswith(".docx")

        print(f"✓ DOCX 生成成功: {docx_path}")
        print(f"  文件大小: {Path(docx_path).stat().st_size} bytes")

    @pytest.mark.asyncio
    async def test_generate_docx_complex(
        self, integration_output_dir, sample_courseware_content
    ):
        """测试复杂教案 DOCX 生成"""
        service = GenerationService(output_dir=str(integration_output_dir))

        docx_path = await service.generate_docx(
            sample_courseware_content, "integration-test-complex"
        )

        assert Path(docx_path).exists()
        assert Path(docx_path).stat().st_size > 0
        print(f"✓ 复杂教案 DOCX 生成成功: {docx_path}")

    @pytest.mark.asyncio
    async def test_docx_file_is_valid(
        self, integration_output_dir, simple_courseware_content
    ):
        """测试生成的 DOCX 文件是否有效"""
        service = GenerationService(output_dir=str(integration_output_dir))

        docx_path = await service.generate_docx(
            simple_courseware_content, "integration-test-valid-docx"
        )

        # 验证文件是 ZIP 格式（DOCX 本质上是 ZIP）
        with open(docx_path, "rb") as f:
            header = f.read(4)
            assert header[:2] == b"PK"

        print("✓ DOCX 文件格式有效")
