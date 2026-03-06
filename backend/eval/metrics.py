"""
RAG 评测指标计算模块

支持指标：
- hit_rate@k: 前 k 个结果中包含相关 chunk 的比例
- mrr@k: Mean Reciprocal Rank，衡量相关结果排名
- keyword_hit_rate: 结果内容包含期望关键词的比例
- avg_latency_ms: 平均检索延迟（毫秒）
- failure_rate: 检索失败（异常/空结果）比例
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EvalResult:
    """单条评测用例的结果"""

    case_id: str
    query: str
    retrieved_chunk_ids: list[str]
    retrieved_contents: list[str]
    latency_ms: float
    error: Optional[str] = None

    @property
    def failed(self) -> bool:
        return self.error is not None or len(self.retrieved_chunk_ids) == 0


@dataclass
class EvalMetrics:
    """评测指标汇总"""

    total_cases: int
    hit_rate_at_k: dict[int, float] = field(default_factory=dict)
    mrr_at_k: dict[int, float] = field(default_factory=dict)
    keyword_hit_rate: float = 0.0
    avg_latency_ms: float = 0.0
    failure_rate: float = 0.0
    failed_case_ids: list[str] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            f"总用例数: {self.total_cases}",
            f"失败率: {self.failure_rate:.1%}  ({len(self.failed_case_ids)} 条)",
            f"平均延迟: {self.avg_latency_ms:.1f} ms",
            f"关键词命中率: {self.keyword_hit_rate:.1%}",
        ]
        for k, v in sorted(self.hit_rate_at_k.items()):
            lines.append(f"Hit Rate @{k}: {v:.1%}")
        for k, v in sorted(self.mrr_at_k.items()):
            lines.append(f"MRR @{k}: {v:.4f}")
        return "\n".join(lines)


def compute_hit_rate(
    results: list[EvalResult],
    cases: list[dict],
    k: int,
) -> float:
    """
    Hit Rate @k: 有 relevant_chunk_ids 的用例中，前 k 个结果命中的比例。
    无 relevant_chunk_ids 的用例跳过（不计入分母）。
    """
    hits = 0
    total = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        relevant = set(case.get("relevant_chunk_ids", []))
        if not relevant:
            continue
        total += 1
        top_k = set(r.retrieved_chunk_ids[:k])
        if top_k & relevant:
            hits += 1

    return hits / total if total > 0 else 0.0


def compute_mrr(
    results: list[EvalResult],
    cases: list[dict],
    k: int,
) -> float:
    """
    MRR @k: 第一个相关结果排名的倒数均值。
    无 relevant_chunk_ids 的用例跳过。
    """
    rr_sum = 0.0
    total = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        relevant = set(case.get("relevant_chunk_ids", []))
        if not relevant:
            continue
        total += 1
        for rank, cid in enumerate(r.retrieved_chunk_ids[:k], start=1):
            if cid in relevant:
                rr_sum += 1.0 / rank
                break

    return rr_sum / total if total > 0 else 0.0


def compute_keyword_hit_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    """
    关键词命中率：结果内容中包含至少一个期望关键词的用例比例。
    用于无 ground-truth chunk_id 时的替代指标。
    """
    hits = 0
    total = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        keywords = case.get("expected_keywords", [])
        if not keywords:
            continue
        total += 1
        combined = " ".join(r.retrieved_contents).lower()
        if any(kw.lower() in combined for kw in keywords):
            hits += 1

    return hits / total if total > 0 else 0.0


def compute_metrics(
    results: list[EvalResult],
    cases: list[dict],
    k_values: Optional[list[int]] = None,
) -> EvalMetrics:
    """计算全部评测指标"""
    if k_values is None:
        k_values = [1, 3, 5]

    failed = [r for r in results if r.failed]
    succeeded = [r for r in results if not r.failed]

    failure_rate = len(failed) / len(results) if results else 0.0
    avg_latency = (
        sum(r.latency_ms for r in succeeded) / len(succeeded) if succeeded else 0.0
    )

    hit_rate_at_k = {k: compute_hit_rate(results, cases, k) for k in k_values}
    mrr_at_k = {k: compute_mrr(results, cases, k) for k in k_values}
    keyword_hit_rate = compute_keyword_hit_rate(results, cases)

    return EvalMetrics(
        total_cases=len(results),
        hit_rate_at_k=hit_rate_at_k,
        mrr_at_k=mrr_at_k,
        keyword_hit_rate=keyword_hit_rate,
        avg_latency_ms=avg_latency,
        failure_rate=failure_rate,
        failed_case_ids=[r.case_id for r in failed],
    )
