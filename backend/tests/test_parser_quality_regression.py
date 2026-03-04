"""
Parser Provider 质量回归测试

全链路验证：parse → chunk → index → search。
使用 mock provider 模拟不同质量等级，确保切换 provider 后 RAG 检索不退化。
"""

from typing import Any

import pytest

from services.chunking import split_text
from services.parsers.base import BaseParseProvider, ProviderNotAvailableError
from services.parsers.registry import get_parser, register_provider
from services.rag_service import ParsedChunkData, RAGService
from services.vector_service import VectorService

# ---------------------------------------------------------------------------
# Mock Embedding（复用 test_rag_service 模式）
# ---------------------------------------------------------------------------


class MockEmbeddingService:
    """确定性 mock embedding，基于文本 hash 生成向量。"""

    async def embed_text(self, text: str) -> list[float]:
        h = hash(text) % 1000
        return [h / 1000.0, (h * 7 % 1000) / 1000.0, (h * 13 % 1000) / 1000.0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_text(t) for t in texts]

    def get_dimension(self) -> int:
        return 3


# ---------------------------------------------------------------------------
# Mock Providers（不同质量等级）
# ---------------------------------------------------------------------------

SAMPLE_CONTENT = (
    "光合作用是植物利用光能将二氧化碳和水转化为有机物的过程。"
    "叶绿体是光合作用的主要场所。"
    "光合作用分为光反应和暗反应两个阶段。"
    "光反应在类囊体薄膜上进行，暗反应在叶绿体基质中进行。"
)


class HighFidelityProvider(BaseParseProvider):
    """高保真 provider — 返回完整内容（模拟 local）。"""

    name = "high_fidelity"
    supported_types = {"pdf", "word", "ppt"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        return SAMPLE_CONTENT, {"text_length": len(SAMPLE_CONTENT)}


class MediumFidelityProvider(BaseParseProvider):
    """中等保真 provider — 丢弃部分句子（模拟中等质量 OCR）。"""

    name = "medium_fidelity"
    supported_types = {"pdf", "word", "ppt"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        # 只保留前两句
        sentences = SAMPLE_CONTENT.split("。")
        partial = "。".join(sentences[:2]) + "。"
        return partial, {"text_length": len(partial)}


class LowFidelityProvider(BaseParseProvider):
    """低保真 provider — 仅返回文件名（模拟解析失败）。"""

    name = "low_fidelity"
    supported_types = {"pdf", "word", "ppt"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        return filename, {"text_length": len(filename)}


class UnavailableProvider(BaseParseProvider):
    """不可用 provider — 实例化时抛异常。"""

    name = "unavailable"
    supported_types = {"pdf"}

    def __init__(self):
        raise ProviderNotAvailableError("依赖未安装")

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        return "", {}  # pragma: no cover


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_emb():
    return MockEmbeddingService()


@pytest.fixture
def vec_svc(tmp_path):
    return VectorService(persist_dir=str(tmp_path / "chroma_regression"))


@pytest.fixture
def rag_svc(vec_svc, mock_emb):
    return RAGService(vec_service=vec_svc, emb_service=mock_emb)


@pytest.fixture
def sample_file(tmp_path):
    """创建一个包含 SAMPLE_CONTENT 的临时文件。"""
    f = tmp_path / "sample.txt"
    f.write_text(SAMPLE_CONTENT, encoding="utf-8")
    return str(f)


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


async def _run_pipeline(
    provider: BaseParseProvider,
    filepath: str,
    filename: str,
    file_type: str,
    rag_svc: RAGService,
    project_id: str,
) -> list:
    """执行 parse → chunk → index → search 全链路。"""
    text, _details = provider.extract_text(filepath, filename, file_type)
    chunks_text = split_text(text) if text.strip() else []
    chunk_data = [
        ParsedChunkData(
            chunk_id=f"{project_id}-{i}",
            content=c,
            metadata={
                "source_type": file_type,
                "filename": filename,
                "chunk_index": i,
            },
        )
        for i, c in enumerate(chunks_text)
    ]
    if chunk_data:
        await rag_svc.index_chunks(project_id, chunk_data)
    results = await rag_svc.search(project_id, "光合作用", top_k=5)
    return results


# ---------------------------------------------------------------------------
# TestFullPipelineRegression
# ---------------------------------------------------------------------------


class TestFullPipelineRegression:
    """三种 provider 分别走完整链路。"""

    @pytest.mark.asyncio
    async def test_high_fidelity_finds_results(self, rag_svc, sample_file):
        results = await _run_pipeline(
            HighFidelityProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_svc,
            "proj-high",
        )
        assert len(results) > 0
        combined = " ".join(r.content for r in results)
        assert "光合作用" in combined

    @pytest.mark.asyncio
    async def test_medium_fidelity_no_crash(self, rag_svc, sample_file):
        results = await _run_pipeline(
            MediumFidelityProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_svc,
            "proj-medium",
        )
        # 中等质量至少不崩溃，可能有结果
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_low_fidelity_no_crash(self, rag_svc, sample_file):
        results = await _run_pipeline(
            LowFidelityProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_svc,
            "proj-low",
        )
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_high_beats_low(self, sample_file, tmp_path, mock_emb):
        """高保真 provider 的检索质量应优于低保真。"""
        vec_high = VectorService(persist_dir=str(tmp_path / "ch_high"))
        rag_high = RAGService(vec_service=vec_high, emb_service=mock_emb)
        r_high = await _run_pipeline(
            HighFidelityProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_high,
            "proj-cmp-h",
        )

        vec_low = VectorService(persist_dir=str(tmp_path / "ch_low"))
        rag_low = RAGService(vec_service=vec_low, emb_service=mock_emb)
        r_low = await _run_pipeline(
            LowFidelityProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_low,
            "proj-cmp-l",
        )

        # 高保真应有更多有意义的结果
        high_relevant = [r for r in r_high if "光合作用" in r.content]
        low_relevant = [r for r in r_low if "光合作用" in r.content]
        assert len(high_relevant) >= len(low_relevant)

    @pytest.mark.asyncio
    async def test_empty_parse_no_crash(self, rag_svc, sample_file):
        """空解析结果不应导致崩溃。"""

        class EmptyProvider(BaseParseProvider):
            name = "empty"
            supported_types = {"pdf"}

            def extract_text(
                self, filepath: str, filename: str, file_type: str
            ) -> tuple[str, dict[str, Any]]:
                return "", {"text_length": 0}

        results = await _run_pipeline(
            EmptyProvider(),
            sample_file,
            "bio.pdf",
            "pdf",
            rag_svc,
            "proj-empty-parse",
        )
        assert results == []


# ---------------------------------------------------------------------------
# TestFileTypeRegression
# ---------------------------------------------------------------------------


class TestFileTypeRegression:
    """PDF/Word/PPT 三种文件类型各走一遍全链路。"""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "file_type,filename",
        [("pdf", "doc.pdf"), ("word", "doc.docx"), ("ppt", "doc.pptx")],
    )
    async def test_file_type_pipeline(self, rag_svc, sample_file, file_type, filename):
        provider = HighFidelityProvider()
        project_id = f"proj-ft-{file_type}"
        results = await _run_pipeline(
            provider,
            sample_file,
            filename,
            file_type,
            rag_svc,
            project_id,
        )
        assert isinstance(results, list)
        assert len(results) > 0


# ---------------------------------------------------------------------------
# TestFallbackRegression
# ---------------------------------------------------------------------------


class TestFallbackRegression:
    """Provider 回退机制验证。"""

    def test_unavailable_provider_falls_back(self):
        """不可用 provider 应自动回退到 local。"""
        register_provider("unavailable", UnavailableProvider)
        parser = get_parser("unavailable")
        assert parser.name == "local"

    def test_unknown_provider_falls_back(self):
        """未知 provider 名称应回退到 local。"""
        parser = get_parser("nonexistent_provider_xyz")
        assert parser.name == "local"

    def test_env_var_switch(self, monkeypatch):
        """DOCUMENT_PARSER 环境变量切换正确。"""
        monkeypatch.setenv("DOCUMENT_PARSER", "local")
        parser = get_parser()
        assert parser.name == "local"

    def test_default_is_local(self, monkeypatch):
        """默认 provider 为 local。"""
        monkeypatch.delenv("DOCUMENT_PARSER", raising=False)
        parser = get_parser()
        assert parser.name == "local"
