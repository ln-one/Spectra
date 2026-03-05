"""
Provider 质量对比工具

基于 eval/metrics.py 已有指标，对比不同解析器 provider 的 RAG 检索质量。
用于切换 provider 后的回归检测。
"""

import logging
import shutil
import tempfile
from dataclasses import dataclass, field
from typing import Optional

from services.chunking import split_text
from services.parsers.base import BaseParseProvider
from services.rag_service import ParsedChunkData, RAGService
from services.vector_service import VectorService

logger = logging.getLogger(__name__)


@dataclass
class QueryWithKeywords:
    """带期望关键词的查询。"""

    query: str
    expected_keywords: list[str]


@dataclass
class ProviderQualityReport:
    """单个 provider 的质量指标。"""

    provider_name: str
    total_chunks: int = 0
    avg_chunk_length: float = 0.0
    keyword_hit_rate: float = 0.0
    search_results_count: int = 0

    def summary_line(self) -> str:
        return (
            f"{self.provider_name}: "
            f"chunks={self.total_chunks}, "
            f"avg_len={self.avg_chunk_length:.0f}, "
            f"kw_hit={self.keyword_hit_rate:.1%}, "
            f"results={self.search_results_count}"
        )


@dataclass
class ComparisonReport:
    """多 provider 对比报告。"""

    reports: list[ProviderQualityReport] = field(default_factory=list)
    baseline_provider: str = ""
    regression_threshold: float = 0.2

    def summary(self) -> str:
        """生成可读的对比摘要。"""
        lines = [f"Provider 质量对比（baseline: {self.baseline_provider}）", ""]
        for r in self.reports:
            marker = " [baseline]" if r.provider_name == self.baseline_provider else ""
            lines.append(f"  {r.summary_line()}{marker}")
        regressions = self.quality_regression_detected()
        if regressions:
            lines.append("")
            lines.append("回归检测:")
            for name, delta in regressions.items():
                lines.append(f"  {name}: keyword_hit_rate 下降 {delta:.1%}")
        return "\n".join(lines)

    def quality_regression_detected(self) -> dict[str, float]:
        """
        检测质量回归。

        Returns:
            退化的 provider 名称 → 与 baseline 的 keyword_hit_rate 差值。
            空字典表示无退化。
        """
        baseline_report = None
        for r in self.reports:
            if r.provider_name == self.baseline_provider:
                baseline_report = r
                break
        if baseline_report is None:
            return {}

        regressions: dict[str, float] = {}
        for r in self.reports:
            if r.provider_name == self.baseline_provider:
                continue
            delta = baseline_report.keyword_hit_rate - r.keyword_hit_rate
            if delta > self.regression_threshold:
                regressions[r.provider_name] = delta
        return regressions


# ---------------------------------------------------------------------------
# 核心对比函数
# ---------------------------------------------------------------------------


async def compare_providers(
    providers: list[BaseParseProvider],
    content_files: list[tuple[str, str, str]],
    queries_with_keywords: list[QueryWithKeywords],
    baseline_provider: Optional[str] = None,
    emb_service=None,
    regression_threshold: float = 0.2,
) -> ComparisonReport:
    """
    对比多个 provider 的 RAG 检索质量。

    Args:
        providers: 待对比的 provider 列表。
        content_files: [(filepath, filename, file_type), ...] 测试文件。
        queries_with_keywords: 带期望关键词的查询列表。
        baseline_provider: 基线 provider 名称（默认取第一个）。
        emb_service: Embedding 服务实例（测试时传 mock）。
        regression_threshold: 回归检测阈值。

    Returns:
        ComparisonReport 对比报告。
    """
    if not baseline_provider and providers:
        baseline_provider = providers[0].name

    reports: list[ProviderQualityReport] = []

    for provider in providers:
        try:
            report = await _evaluate_single_provider(
                provider=provider,
                content_files=content_files,
                queries=queries_with_keywords,
                emb_service=emb_service,
            )
        except Exception as exc:
            logger.exception(
                "evaluate_provider_failed: provider=%s error=%s", provider.name, exc
            )
            report = ProviderQualityReport(provider_name=provider.name)
        reports.append(report)

    return ComparisonReport(
        reports=reports,
        baseline_provider=baseline_provider or "",
        regression_threshold=regression_threshold,
    )


async def _evaluate_single_provider(
    provider: BaseParseProvider,
    content_files: list[tuple[str, str, str]],
    queries: list[QueryWithKeywords],
    emb_service=None,
) -> ProviderQualityReport:
    """评估单个 provider 的质量指标。"""
    tmp_dir = tempfile.mkdtemp(prefix="spectra_eval_")
    vec_svc = VectorService(persist_dir=tmp_dir)
    rag_svc = RAGService(vec_service=vec_svc, emb_service=emb_service)
    project_id = f"eval-{provider.name}"

    try:
        # parse → chunk → index
        all_chunks: list[str] = []
        chunk_idx = 0
        for filepath, filename, file_type in content_files:
            try:
                text, _details = provider.extract_text(filepath, filename, file_type)
            except Exception as exc:
                logger.warning(
                    "provider_extract_failed: provider=%s file=%s error=%s",
                    provider.name,
                    filename,
                    exc,
                )
                continue
            if not text.strip():
                continue
            chunks_text = split_text(text)
            chunk_data = [
                ParsedChunkData(
                    chunk_id=f"{provider.name}-{chunk_idx + i}",
                    content=c,
                    metadata={
                        "source_type": file_type,
                        "filename": filename,
                        "chunk_index": chunk_idx + i,
                    },
                )
                for i, c in enumerate(chunks_text)
            ]
            all_chunks.extend(chunks_text)
            chunk_idx += len(chunks_text)
            if chunk_data:
                await rag_svc.index_chunks(project_id, chunk_data)

        # search → compute keyword hit rate
        total_hits = 0
        total_queries = 0
        total_results = 0

        for q in queries:
            if not q.expected_keywords:
                continue
            total_queries += 1
            try:
                results = await rag_svc.search(project_id, q.query, top_k=5)
            except Exception as exc:
                logger.warning(
                    "provider_search_failed: provider=%s query=%s error=%s",
                    provider.name,
                    q.query,
                    exc,
                )
                continue
            total_results += len(results)
            combined = " ".join(r.content for r in results).lower()
            if any(kw.lower() in combined for kw in q.expected_keywords):
                total_hits += 1

        avg_len = (
            sum(len(c) for c in all_chunks) / len(all_chunks) if all_chunks else 0.0
        )

        return ProviderQualityReport(
            provider_name=provider.name,
            total_chunks=len(all_chunks),
            avg_chunk_length=avg_len,
            keyword_hit_rate=(total_hits / total_queries if total_queries > 0 else 0.0),
            search_results_count=total_results,
        )
    finally:
        # 释放 ChromaDB 文件锁后再清理临时目录（Windows 兼容）
        del rag_svc
        if vec_svc._client is not None:
            del vec_svc._client
        del vec_svc
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
