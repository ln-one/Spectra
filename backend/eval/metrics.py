"""
RAG 评测指标计算模块

支持指标：
- hit_rate@k: 前 k 个结果中包含相关 chunk 的比例
- mrr@k: Mean Reciprocal Rank，衡量相关结果排名
- ndcg@k: Normalized Discounted Cumulative Gain，衡量排序质量
- keyword_hit_rate: 结果内容包含期望关键词的比例
- keyword_coverage_rate: 期望关键词被覆盖的平均比例
- fact_coverage_rate: Top3 结果对必备事实点的平均覆盖比例
- usable_top1_rate: Top1 结果可直接用于回答问题的比例
- usable_top3_rate: Top3 中包含可直接使用证据块的比例
- distractor_intrusion_rate: Top1 被噪声挤占，但 Top3 内仍有可用证据的比例
- rankable_case_coverage_rate: 可参与排序评测的样本覆盖率
- avg_latency_ms: 平均检索延迟（毫秒）
- p95_latency_ms: P95 检索延迟（毫秒）
- failure_rate: 检索失败（异常/空结果）比例
"""

from dataclasses import dataclass, field
from math import ceil
from math import log2
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
    final_answer: Optional[str] = None

    @property
    def failed(self) -> bool:
        return self.error is not None or len(self.retrieved_chunk_ids) == 0


@dataclass
class EvalMetrics:
    """评测指标汇总"""

    total_cases: int
    rankable_case_count: int = 0
    rankable_case_coverage_rate: float = 0.0
    hit_rate_at_k: dict[int, float] = field(default_factory=dict)
    mrr_at_k: dict[int, float] = field(default_factory=dict)
    ndcg_at_k: dict[int, float] = field(default_factory=dict)
    keyword_hit_rate: float = 0.0
    keyword_coverage_rate: float = 0.0
    fact_coverage_rate: float = 0.0
    usable_top1_rate: float = 0.0
    usable_top3_rate: float = 0.0
    distractor_intrusion_rate: float = 0.0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    failure_rate: float = 0.0
    failed_case_ids: list[str] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            f"总用例数: {self.total_cases}",
            f"可评估排序样本数: {self.rankable_case_count}  ({self.rankable_case_coverage_rate:.1%})",
            f"失败率: {self.failure_rate:.1%}  ({len(self.failed_case_ids)} 条)",
            f"平均延迟: {self.avg_latency_ms:.1f} ms",
            f"P95 延迟: {self.p95_latency_ms:.1f} ms",
            f"关键词命中率: {self.keyword_hit_rate:.1%}",
            f"关键词覆盖率: {self.keyword_coverage_rate:.1%}",
            f"事实覆盖率: {self.fact_coverage_rate:.1%}",
            f"可用 Top1 率: {self.usable_top1_rate:.1%}",
            f"可用 Top3 率: {self.usable_top3_rate:.1%}",
            f"干扰项侵入率: {self.distractor_intrusion_rate:.1%}",
        ]
        for k, v in sorted(self.hit_rate_at_k.items()):
            label = f"Hit Rate @{k}"
            if k == 1:
                label = "Hit Rate @1 (Top1 准确率)"
            lines.append(f"{label}: {v:.1%}")
        for k, v in sorted(self.mrr_at_k.items()):
            lines.append(f"MRR @{k}: {v:.4f}")
        for k, v in sorted(self.ndcg_at_k.items()):
            lines.append(f"nDCG @{k}: {v:.4f}")
        return "\n".join(lines)


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return "".join(str(value).lower().split())


def _string_list(case: dict, field: str) -> list[str]:
    return [
        item for item in case.get(field, []) if isinstance(item, str) and item.strip()
    ]


def _case_required_facts(case: dict) -> list[str]:
    required_facts = _string_list(case, "required_facts")
    if required_facts:
        return required_facts
    return _string_list(case, "expected_keywords")


def _case_usable_chunk_ids(case: dict) -> set[str]:
    usable_chunk_ids = _string_list(case, "usable_chunk_ids")
    if usable_chunk_ids:
        return set(usable_chunk_ids)
    return set(_string_list(case, "relevant_chunk_ids"))


def _case_usable_min_fact_coverage(case: dict) -> float:
    value = case.get("usable_min_fact_coverage", 0.5)
    if not isinstance(value, (int, float)):
        return 0.5
    return min(1.0, max(0.0, float(value)))


def _case_fact_top_k(case: dict, default: int = 3) -> int:
    value = case.get("fact_top_k", default)
    if not isinstance(value, int) or value <= 0:
        return default
    return value


def _content_at_rank(result: EvalResult, rank: int) -> str:
    if rank < 0 or rank >= len(result.retrieved_contents):
        return ""
    return result.retrieved_contents[rank]


def _fact_coverage_for_text(facts: list[str], text: str) -> float:
    normalized_text = _normalize_text(text)
    if not facts:
        return 0.0
    matched = sum(
        1
        for fact in facts
        if _normalize_text(fact) and _normalize_text(fact) in normalized_text
    )
    return matched / len(facts)


def _supports_usability_eval(case: dict) -> bool:
    return bool(_case_required_facts(case) or _case_usable_chunk_ids(case))


def _is_usable_chunk(case: dict, chunk_id: str, content: str) -> bool:
    usable_chunk_ids = _case_usable_chunk_ids(case)
    if usable_chunk_ids and chunk_id not in usable_chunk_ids:
        return False

    required_facts = _case_required_facts(case)
    if not required_facts:
        return bool(chunk_id)

    return _fact_coverage_for_text(
        required_facts, content
    ) >= _case_usable_min_fact_coverage(case)


def compute_rankable_case_coverage(cases: list[dict]) -> tuple[int, float]:
    rankable_case_count = sum(1 for case in cases if case.get("relevant_chunk_ids"))
    coverage_rate = rankable_case_count / len(cases) if cases else 0.0
    return rankable_case_count, coverage_rate


def compute_p95_latency_ms(results: list[EvalResult]) -> float:
    latencies = sorted(r.latency_ms for r in results if not r.failed)
    if not latencies:
        return 0.0
    index = max(0, ceil(len(latencies) * 0.95) - 1)
    return latencies[index]


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


def compute_ndcg(
    results: list[EvalResult],
    cases: list[dict],
    k: int,
) -> float:
    """
    nDCG @k: 归一化折损累计增益。
    当前使用二元相关性（命中 relevant_chunk_ids 即视为 relevant）。
    """
    total = 0
    ndcg_sum = 0.0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        relevant = set(case.get("relevant_chunk_ids", []))
        if not relevant:
            continue

        total += 1
        dcg = 0.0
        for idx, cid in enumerate(r.retrieved_chunk_ids[:k], start=1):
            if cid in relevant:
                dcg += 1.0 / log2(idx + 1)

        ideal_hits = min(len(relevant), k)
        idcg = sum(1.0 / log2(idx + 1) for idx in range(1, ideal_hits + 1))
        if idcg > 0:
            ndcg_sum += dcg / idcg

    return ndcg_sum / total if total > 0 else 0.0


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
        combined = _normalize_text(" ".join(r.retrieved_contents))
        if any(_normalize_text(kw) in combined for kw in keywords):
            hits += 1

    return hits / total if total > 0 else 0.0


def compute_keyword_coverage_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    """
    关键词覆盖率：每条用例的期望关键词中，有多少比例出现在检索结果里。
    """
    total = 0
    coverage_sum = 0.0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        keywords = [kw for kw in case.get("expected_keywords", []) if kw]
        if not keywords:
            continue
        total += 1
        combined = _normalize_text(" ".join(r.retrieved_contents))
        matched = sum(1 for kw in keywords if _normalize_text(kw) in combined)
        coverage_sum += matched / len(keywords)

    return coverage_sum / total if total > 0 else 0.0


def compute_fact_coverage_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    """
    事实覆盖率：Top3（或 case.fact_top_k）结果中覆盖必备事实点的平均比例。
    用于衡量结果是否足以支撑回答，而不是只碰到表面关键词。
    """
    total = 0
    coverage_sum = 0.0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed:
            continue
        case = case_map.get(r.case_id, {})
        required_facts = _case_required_facts(case)
        if not required_facts:
            continue
        total += 1
        top_k = _case_fact_top_k(case, default=3)
        combined = " ".join(r.retrieved_contents[:top_k])
        coverage_sum += _fact_coverage_for_text(required_facts, combined)

    return coverage_sum / total if total > 0 else 0.0


def compute_usable_top1_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    total = 0
    usable = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed or not r.retrieved_chunk_ids:
            continue
        case = case_map.get(r.case_id, {})
        if not _supports_usability_eval(case):
            continue
        total += 1
        if _is_usable_chunk(case, r.retrieved_chunk_ids[0], _content_at_rank(r, 0)):
            usable += 1

    return usable / total if total > 0 else 0.0


def compute_usable_top3_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    total = 0
    usable = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed or not r.retrieved_chunk_ids:
            continue
        case = case_map.get(r.case_id, {})
        if not _supports_usability_eval(case):
            continue
        total += 1
        top3_usable = any(
            _is_usable_chunk(case, chunk_id, _content_at_rank(r, idx))
            for idx, chunk_id in enumerate(r.retrieved_chunk_ids[:3])
        )
        if top3_usable:
            usable += 1

    return usable / total if total > 0 else 0.0


def compute_distractor_intrusion_rate(
    results: list[EvalResult],
    cases: list[dict],
) -> float:
    """
    干扰项侵入率：Top1 不是可用证据，但 Top3 中存在可用证据的比例。
    该指标聚焦“正确内容在附近，但高位被噪声挤占”的情况。
    """
    total = 0
    intrusions = 0
    case_map = {c["id"]: c for c in cases}

    for r in results:
        if r.failed or not r.retrieved_chunk_ids:
            continue
        case = case_map.get(r.case_id, {})
        if not _supports_usability_eval(case):
            continue
        total += 1
        top1_usable = _is_usable_chunk(
            case, r.retrieved_chunk_ids[0], _content_at_rank(r, 0)
        )
        later_usable = any(
            _is_usable_chunk(case, chunk_id, _content_at_rank(r, idx))
            for idx, chunk_id in enumerate(r.retrieved_chunk_ids[1:3], start=1)
        )
        if not top1_usable and later_usable:
            intrusions += 1

    return intrusions / total if total > 0 else 0.0


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
    p95_latency = compute_p95_latency_ms(results)

    rankable_case_count, rankable_case_coverage_rate = compute_rankable_case_coverage(
        cases
    )
    hit_rate_at_k = {k: compute_hit_rate(results, cases, k) for k in k_values}
    mrr_at_k = {k: compute_mrr(results, cases, k) for k in k_values}
    ndcg_at_k = {k: compute_ndcg(results, cases, k) for k in k_values}
    keyword_hit_rate = compute_keyword_hit_rate(results, cases)
    keyword_coverage_rate = compute_keyword_coverage_rate(results, cases)
    fact_coverage_rate = compute_fact_coverage_rate(results, cases)
    usable_top1_rate = compute_usable_top1_rate(results, cases)
    usable_top3_rate = compute_usable_top3_rate(results, cases)
    distractor_intrusion_rate = compute_distractor_intrusion_rate(results, cases)

    return EvalMetrics(
        total_cases=len(results),
        rankable_case_count=rankable_case_count,
        rankable_case_coverage_rate=rankable_case_coverage_rate,
        hit_rate_at_k=hit_rate_at_k,
        mrr_at_k=mrr_at_k,
        ndcg_at_k=ndcg_at_k,
        keyword_hit_rate=keyword_hit_rate,
        keyword_coverage_rate=keyword_coverage_rate,
        fact_coverage_rate=fact_coverage_rate,
        usable_top1_rate=usable_top1_rate,
        usable_top3_rate=usable_top3_rate,
        distractor_intrusion_rate=distractor_intrusion_rate,
        avg_latency_ms=avg_latency,
        p95_latency_ms=p95_latency,
        failure_rate=failure_rate,
        failed_case_ids=[r.case_id for r in failed],
    )
