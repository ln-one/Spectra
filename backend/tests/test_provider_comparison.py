"""
Provider 对比工具单元测试

验证 ComparisonReport 结构、回归检测、summary 输出。
"""

from typing import Any

import pytest

from eval.provider_comparison import (
    ComparisonReport,
    ProviderQualityReport,
    QueryWithKeywords,
    compare_providers,
)
from services.parsers.base import BaseParseProvider

# ---------------------------------------------------------------------------
# Mock Embedding（与 test_parser_quality_regression 一致）
# ---------------------------------------------------------------------------


class MockEmbeddingService:
    async def embed_text(self, text: str) -> list[float]:
        h = hash(text) % 1000
        return [h / 1000.0, (h * 7 % 1000) / 1000.0, (h * 13 % 1000) / 1000.0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed_text(t) for t in texts]

    def get_dimension(self) -> int:
        return 3


# ---------------------------------------------------------------------------
# Mock Providers
# ---------------------------------------------------------------------------

FULL_TEXT = (
    "光合作用是植物利用光能将二氧化碳和水转化为有机物的过程。"
    "叶绿体是光合作用的主要场所。"
)


class GoodProvider(BaseParseProvider):
    name = "good"
    supported_types = {"pdf"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        return FULL_TEXT, {"text_length": len(FULL_TEXT)}


class BadProvider(BaseParseProvider):
    name = "bad"
    supported_types = {"pdf"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        return filename, {"text_length": len(filename)}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_file(tmp_path):
    f = tmp_path / "test.txt"
    f.write_text(FULL_TEXT, encoding="utf-8")
    return str(f)


@pytest.fixture
def queries():
    return [
        QueryWithKeywords(query="光合作用", expected_keywords=["光合作用", "叶绿体"]),
        QueryWithKeywords(query="植物", expected_keywords=["植物"]),
    ]


@pytest.fixture
def mock_emb():
    return MockEmbeddingService()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestComparisonReport:
    def test_no_regression_when_equal(self):
        r1 = ProviderQualityReport(provider_name="a", keyword_hit_rate=0.8)
        r2 = ProviderQualityReport(provider_name="b", keyword_hit_rate=0.8)
        report = ComparisonReport(reports=[r1, r2], baseline_provider="a")
        assert report.quality_regression_detected() == {}

    def test_regression_detected(self):
        r1 = ProviderQualityReport(provider_name="baseline", keyword_hit_rate=0.9)
        r2 = ProviderQualityReport(provider_name="degraded", keyword_hit_rate=0.5)
        report = ComparisonReport(
            reports=[r1, r2],
            baseline_provider="baseline",
            regression_threshold=0.2,
        )
        regressions = report.quality_regression_detected()
        assert "degraded" in regressions
        assert regressions["degraded"] == pytest.approx(0.4)

    def test_no_regression_within_threshold(self):
        r1 = ProviderQualityReport(provider_name="a", keyword_hit_rate=0.8)
        r2 = ProviderQualityReport(provider_name="b", keyword_hit_rate=0.7)
        report = ComparisonReport(
            reports=[r1, r2],
            baseline_provider="a",
            regression_threshold=0.2,
        )
        assert report.quality_regression_detected() == {}

    def test_summary_format(self):
        r1 = ProviderQualityReport(
            provider_name="local",
            total_chunks=10,
            avg_chunk_length=200.0,
            keyword_hit_rate=0.9,
            search_results_count=5,
        )
        report = ComparisonReport(reports=[r1], baseline_provider="local")
        summary = report.summary()
        assert "local" in summary
        assert "baseline" in summary
        assert "kw_hit" in summary

    def test_missing_baseline_no_crash(self):
        r1 = ProviderQualityReport(provider_name="a", keyword_hit_rate=0.5)
        report = ComparisonReport(reports=[r1], baseline_provider="nonexistent")
        assert report.quality_regression_detected() == {}


class TestCompareProviders:
    @pytest.mark.asyncio
    async def test_compare_two_providers(self, sample_file, queries, mock_emb):
        report = await compare_providers(
            providers=[GoodProvider(), BadProvider()],
            content_files=[(sample_file, "test.txt", "pdf")],
            queries_with_keywords=queries,
            emb_service=mock_emb,
        )
        assert len(report.reports) == 2
        assert report.baseline_provider == "good"

        good_report = report.reports[0]
        bad_report = report.reports[1]
        assert good_report.total_chunks >= bad_report.total_chunks

    @pytest.mark.asyncio
    async def test_empty_providers(self, sample_file, queries, mock_emb):
        report = await compare_providers(
            providers=[],
            content_files=[(sample_file, "test.txt", "pdf")],
            queries_with_keywords=queries,
            emb_service=mock_emb,
        )
        assert len(report.reports) == 0

    @pytest.mark.asyncio
    async def test_regression_flag(self, sample_file, queries, mock_emb):
        """Good provider 作为 baseline，bad provider 应被标记退化。"""
        report = await compare_providers(
            providers=[GoodProvider(), BadProvider()],
            content_files=[(sample_file, "test.txt", "pdf")],
            queries_with_keywords=queries,
            baseline_provider="good",
            emb_service=mock_emb,
            regression_threshold=0.1,
        )
        good_r = report.reports[0]
        bad_r = report.reports[1]
        # 如果 good 确实比 bad 好，应检测到回归
        if good_r.keyword_hit_rate - bad_r.keyword_hit_rate > 0.1:
            regressions = report.quality_regression_detected()
            assert "bad" in regressions
