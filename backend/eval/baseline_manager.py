"""
RAG 评测基线管理工具

用法示例：
    # 冻结当前评测结果为基线
    python eval/baseline_manager.py freeze \
      --result eval/results/latest.json \
      --output eval/baselines/rag-baseline-v1.json

    # 校验当前结果是否退化
    python eval/baseline_manager.py check \
      --current eval/results/latest.json \
      --baseline eval/baselines/rag-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    """基线门禁阈值。"""

    keyword_hit_rate_min_delta: float = -0.03
    keyword_coverage_rate_min_delta: float = -0.03
    fact_coverage_rate_min_delta: float = -0.03
    usable_top1_rate_min_delta: float = -0.05
    usable_top3_rate_min_delta: float = -0.03
    distractor_intrusion_rate_max_delta: float = 0.05
    failure_rate_max_delta: float = 0.05
    avg_latency_ms_max_ratio: float = 1.50
    p95_latency_ms_max_ratio: float = 1.75
    hit_rate_at_1_min_delta: float = -0.05
    hit_rate_at_3_min_delta: float = -0.05
    ndcg_at_5_min_delta: float = -0.05
    rankable_case_coverage_rate_hard_floor: float = 0.80
    explainability_rate_min_delta: float = -0.02
    continuity_rate_min_delta: float = -0.02
    fallback_hit_rate_min_delta: float = -0.05
    explainability_rate_hard_floor: float = 0.95
    continuity_rate_hard_floor: float = 0.95


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_result_payload(payload: dict, source: Path) -> None:
    if "metrics" not in payload:
        raise ValueError(f"{source} 缺少 metrics 字段")
    metrics = payload["metrics"]
    required = {"keyword_hit_rate", "failure_rate", "avg_latency_ms"}
    missing = [k for k in required if k not in metrics]
    if missing:
        raise ValueError(f"{source} 缺少指标字段: {', '.join(missing)}")


def _append_min_delta_violation(
    violations: list[str],
    curr_m: dict,
    base_m: dict,
    metric_key: str,
    threshold: float,
) -> None:
    current_value = curr_m.get(metric_key)
    baseline_value = base_m.get(metric_key)
    if current_value is None or baseline_value is None:
        violations.append(f"RAG 指标缺失: {metric_key}")
        return
    delta = current_value - baseline_value
    if delta < threshold:
        violations.append(f"{metric_key} 下降 {delta:.2%} " f"(阈值 {threshold:.2%})")


def _append_max_delta_violation(
    violations: list[str],
    curr_m: dict,
    base_m: dict,
    metric_key: str,
    threshold: float,
) -> None:
    current_value = curr_m.get(metric_key)
    baseline_value = base_m.get(metric_key)
    if current_value is None or baseline_value is None:
        violations.append(f"RAG 指标缺失: {metric_key}")
        return
    delta = current_value - baseline_value
    if delta > threshold:
        violations.append(f"{metric_key} 上升 {delta:.2%} " f"(阈值 {threshold:.2%})")


def _append_ratio_violation(
    violations: list[str],
    curr_m: dict,
    base_m: dict,
    metric_key: str,
    max_ratio: float,
) -> None:
    current_value = curr_m.get(metric_key)
    baseline_value = base_m.get(metric_key)
    if current_value is None or baseline_value is None:
        violations.append(f"RAG 指标缺失: {metric_key}")
        return

    if baseline_value <= 0:
        if current_value > 0:
            violations.append(f"baseline {metric_key} 为 0，无法进行比例比较")
        return

    ratio = current_value / baseline_value
    if ratio > max_ratio:
        violations.append(f"{metric_key} 比例 {ratio:.2f}x " f"(阈值 {max_ratio:.2f}x)")


def freeze_baseline(
    result_path: Path,
    output_path: Path,
    guardrails: Guardrails,
    notes: str | None,
) -> dict:
    result = _load_json(result_path)
    _validate_result_payload(result, result_path)

    payload = {
        "baseline_version": "1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_result": str(result_path),
        "notes": notes,
        "tool_version": result.get("tool_version"),
        "dataset_version": result.get("dataset_version"),
        "dataset_path": result.get("dataset_path"),
        "dataset_sha256": result.get("dataset_sha256"),
        "top_k": result.get("top_k"),
        "metrics": result["metrics"],
        "guardrails": {
            "keyword_hit_rate_min_delta": guardrails.keyword_hit_rate_min_delta,
            "keyword_coverage_rate_min_delta": (
                guardrails.keyword_coverage_rate_min_delta
            ),
            "fact_coverage_rate_min_delta": guardrails.fact_coverage_rate_min_delta,
            "usable_top1_rate_min_delta": guardrails.usable_top1_rate_min_delta,
            "usable_top3_rate_min_delta": guardrails.usable_top3_rate_min_delta,
            "distractor_intrusion_rate_max_delta": (
                guardrails.distractor_intrusion_rate_max_delta
            ),
            "failure_rate_max_delta": guardrails.failure_rate_max_delta,
            "avg_latency_ms_max_ratio": guardrails.avg_latency_ms_max_ratio,
            "p95_latency_ms_max_ratio": guardrails.p95_latency_ms_max_ratio,
            "hit_rate_at_1_min_delta": guardrails.hit_rate_at_1_min_delta,
            "hit_rate_at_3_min_delta": guardrails.hit_rate_at_3_min_delta,
            "ndcg_at_5_min_delta": guardrails.ndcg_at_5_min_delta,
            "rankable_case_coverage_rate_hard_floor": (
                guardrails.rankable_case_coverage_rate_hard_floor
            ),
            "explainability_rate_min_delta": guardrails.explainability_rate_min_delta,
            "continuity_rate_min_delta": guardrails.continuity_rate_min_delta,
            "fallback_hit_rate_min_delta": (guardrails.fallback_hit_rate_min_delta),
            "explainability_rate_hard_floor": (
                guardrails.explainability_rate_hard_floor
            ),
            "continuity_rate_hard_floor": guardrails.continuity_rate_hard_floor,
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


def check_regression(
    current_path: Path,
    baseline_path: Path,
    guardrails_override: Guardrails | None = None,
) -> tuple[bool, list[str]]:
    current = _load_json(current_path)
    baseline = _load_json(baseline_path)
    _validate_result_payload(current, current_path)

    baseline_metrics = baseline.get("metrics", {})
    _validate_result_payload({"metrics": baseline_metrics}, baseline_path)

    g = guardrails_override or Guardrails(
        keyword_hit_rate_min_delta=baseline.get("guardrails", {}).get(
            "keyword_hit_rate_min_delta", -0.03
        ),
        keyword_coverage_rate_min_delta=baseline.get("guardrails", {}).get(
            "keyword_coverage_rate_min_delta", -0.03
        ),
        fact_coverage_rate_min_delta=baseline.get("guardrails", {}).get(
            "fact_coverage_rate_min_delta", -0.03
        ),
        usable_top1_rate_min_delta=baseline.get("guardrails", {}).get(
            "usable_top1_rate_min_delta", -0.05
        ),
        usable_top3_rate_min_delta=baseline.get("guardrails", {}).get(
            "usable_top3_rate_min_delta", -0.03
        ),
        distractor_intrusion_rate_max_delta=baseline.get("guardrails", {}).get(
            "distractor_intrusion_rate_max_delta", 0.05
        ),
        failure_rate_max_delta=baseline.get("guardrails", {}).get(
            "failure_rate_max_delta", 0.05
        ),
        avg_latency_ms_max_ratio=baseline.get("guardrails", {}).get(
            "avg_latency_ms_max_ratio", 1.50
        ),
        p95_latency_ms_max_ratio=baseline.get("guardrails", {}).get(
            "p95_latency_ms_max_ratio", 1.75
        ),
        hit_rate_at_1_min_delta=baseline.get("guardrails", {}).get(
            "hit_rate_at_1_min_delta", -0.05
        ),
        hit_rate_at_3_min_delta=baseline.get("guardrails", {}).get(
            "hit_rate_at_3_min_delta", -0.05
        ),
        ndcg_at_5_min_delta=baseline.get("guardrails", {}).get(
            "ndcg_at_5_min_delta", -0.05
        ),
        rankable_case_coverage_rate_hard_floor=baseline.get("guardrails", {}).get(
            "rankable_case_coverage_rate_hard_floor", 0.80
        ),
        explainability_rate_min_delta=baseline.get("guardrails", {}).get(
            "explainability_rate_min_delta", -0.02
        ),
        continuity_rate_min_delta=baseline.get("guardrails", {}).get(
            "continuity_rate_min_delta", -0.02
        ),
        fallback_hit_rate_min_delta=baseline.get("guardrails", {}).get(
            "fallback_hit_rate_min_delta", -0.05
        ),
        explainability_rate_hard_floor=baseline.get("guardrails", {}).get(
            "explainability_rate_hard_floor", 0.95
        ),
        continuity_rate_hard_floor=baseline.get("guardrails", {}).get(
            "continuity_rate_hard_floor", 0.95
        ),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]

    violations: list[str] = []

    _append_min_delta_violation(
        violations,
        curr_m,
        base_m,
        "keyword_hit_rate",
        g.keyword_hit_rate_min_delta,
    )
    _append_min_delta_violation(
        violations,
        curr_m,
        base_m,
        "keyword_coverage_rate",
        g.keyword_coverage_rate_min_delta,
    )
    _append_min_delta_violation(
        violations,
        curr_m,
        base_m,
        "fact_coverage_rate",
        g.fact_coverage_rate_min_delta,
    )
    _append_min_delta_violation(
        violations,
        curr_m,
        base_m,
        "usable_top1_rate",
        g.usable_top1_rate_min_delta,
    )
    _append_min_delta_violation(
        violations,
        curr_m,
        base_m,
        "usable_top3_rate",
        g.usable_top3_rate_min_delta,
    )
    _append_max_delta_violation(
        violations,
        curr_m,
        base_m,
        "distractor_intrusion_rate",
        g.distractor_intrusion_rate_max_delta,
    )

    failure_delta = curr_m["failure_rate"] - base_m["failure_rate"]
    if failure_delta > g.failure_rate_max_delta:
        violations.append(
            f"failure_rate 上升 {failure_delta:.2%} "
            f"(阈值 {g.failure_rate_max_delta:.2%})"
        )

    _append_ratio_violation(
        violations,
        curr_m,
        base_m,
        "avg_latency_ms",
        g.avg_latency_ms_max_ratio,
    )
    _append_ratio_violation(
        violations,
        curr_m,
        base_m,
        "p95_latency_ms",
        g.p95_latency_ms_max_ratio,
    )

    def _get_rank_metric(metrics: dict, field: str, key: str) -> float | None:
        values = metrics.get(field)
        if not isinstance(values, dict):
            return None
        if key in values:
            return values[key]
        try:
            numeric_key = int(key)
        except ValueError:
            return None
        return values.get(numeric_key)

    current_hit_at_1 = _get_rank_metric(curr_m, "hit_rate_at_k", "1")
    baseline_hit_at_1 = _get_rank_metric(base_m, "hit_rate_at_k", "1")
    if current_hit_at_1 is not None and baseline_hit_at_1 is not None:
        hit_at_1_delta = current_hit_at_1 - baseline_hit_at_1
        if hit_at_1_delta < g.hit_rate_at_1_min_delta:
            violations.append(
                f"hit_rate@1 下降 {hit_at_1_delta:.2%} "
                f"(阈值 {g.hit_rate_at_1_min_delta:.2%})"
            )

    current_hit_at_3 = _get_rank_metric(curr_m, "hit_rate_at_k", "3")
    baseline_hit_at_3 = _get_rank_metric(base_m, "hit_rate_at_k", "3")
    if current_hit_at_3 is not None and baseline_hit_at_3 is not None:
        hit_at_3_delta = current_hit_at_3 - baseline_hit_at_3
        if hit_at_3_delta < g.hit_rate_at_3_min_delta:
            violations.append(
                f"hit_rate@3 下降 {hit_at_3_delta:.2%} "
                f"(阈值 {g.hit_rate_at_3_min_delta:.2%})"
            )

    current_ndcg_at_5 = _get_rank_metric(curr_m, "ndcg_at_k", "5")
    baseline_ndcg_at_5 = _get_rank_metric(base_m, "ndcg_at_k", "5")
    if current_ndcg_at_5 is not None and baseline_ndcg_at_5 is not None:
        ndcg_at_5_delta = current_ndcg_at_5 - baseline_ndcg_at_5
        if ndcg_at_5_delta < g.ndcg_at_5_min_delta:
            violations.append(
                f"ndcg@5 下降 {ndcg_at_5_delta:.2%} "
                f"(阈值 {g.ndcg_at_5_min_delta:.2%})"
            )

    if "rankable_case_coverage_rate" in curr_m:
        if (
            curr_m["rankable_case_coverage_rate"]
            < g.rankable_case_coverage_rate_hard_floor
        ):
            violations.append(
                "rankable_case_coverage_rate 绝对值 "
                f"{curr_m['rankable_case_coverage_rate']:.2%} "
                f"(hard floor {g.rankable_case_coverage_rate_hard_floor:.2%})"
            )

    # D5 降级质量门禁（当 current/baseline 任一包含该指标时启用）
    degradation_keys = ("explainability_rate", "continuity_rate", "fallback_hit_rate")
    d5_enabled = any(k in curr_m or k in base_m for k in degradation_keys)

    if d5_enabled:
        for key in degradation_keys:
            if key not in curr_m or key not in base_m:
                violations.append(f"D5 指标缺失: {key}")

        if "explainability_rate" in curr_m and "explainability_rate" in base_m:
            explainability_delta = (
                curr_m["explainability_rate"] - base_m["explainability_rate"]
            )
            if explainability_delta < g.explainability_rate_min_delta:
                violations.append(
                    f"explainability_rate 下降 {explainability_delta:.2%} "
                    f"(阈值 {g.explainability_rate_min_delta:.2%})"
                )
            if curr_m["explainability_rate"] < g.explainability_rate_hard_floor:
                violations.append(
                    f"explainability_rate 绝对值 {curr_m['explainability_rate']:.2%} "
                    f"(hard floor {g.explainability_rate_hard_floor:.2%})"
                )

        if "continuity_rate" in curr_m and "continuity_rate" in base_m:
            continuity_delta = curr_m["continuity_rate"] - base_m["continuity_rate"]
            if continuity_delta < g.continuity_rate_min_delta:
                violations.append(
                    f"continuity_rate 下降 {continuity_delta:.2%} "
                    f"(阈值 {g.continuity_rate_min_delta:.2%})"
                )
            if curr_m["continuity_rate"] < g.continuity_rate_hard_floor:
                violations.append(
                    f"continuity_rate 绝对值 {curr_m['continuity_rate']:.2%} "
                    f"(hard floor {g.continuity_rate_hard_floor:.2%})"
                )

        if "fallback_hit_rate" in curr_m and "fallback_hit_rate" in base_m:
            fallback_delta = curr_m["fallback_hit_rate"] - base_m["fallback_hit_rate"]
            if fallback_delta < g.fallback_hit_rate_min_delta:
                violations.append(
                    f"fallback_hit_rate 下降 {fallback_delta:.2%} "
                    f"(阈值 {g.fallback_hit_rate_min_delta:.2%})"
                )

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="RAG 基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结评测结果为基线")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--keyword-hit-rate-min-delta",
        type=float,
        default=-0.03,
        help="关键词命中率最低允许变化（默认 -0.03）",
    )
    freeze_parser.add_argument(
        "--keyword-coverage-rate-min-delta",
        type=float,
        default=-0.03,
        help="关键词覆盖率最低允许变化（默认 -0.03）",
    )
    freeze_parser.add_argument(
        "--fact-coverage-rate-min-delta",
        type=float,
        default=-0.03,
        help="事实覆盖率最低允许变化（默认 -0.03）",
    )
    freeze_parser.add_argument(
        "--usable-top1-rate-min-delta",
        type=float,
        default=-0.05,
        help="可用 Top1 率最低允许变化（默认 -0.05）",
    )
    freeze_parser.add_argument(
        "--usable-top3-rate-min-delta",
        type=float,
        default=-0.03,
        help="可用 Top3 率最低允许变化（默认 -0.03）",
    )
    freeze_parser.add_argument(
        "--distractor-intrusion-rate-max-delta",
        type=float,
        default=0.05,
        help="干扰项侵入率最大允许上升（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--failure-rate-max-delta",
        type=float,
        default=0.05,
        help="失败率最大允许上升（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--avg-latency-ms-max-ratio",
        type=float,
        default=1.50,
        help="平均延迟最大允许倍数（默认 1.50）",
    )
    freeze_parser.add_argument(
        "--p95-latency-ms-max-ratio",
        type=float,
        default=1.75,
        help="P95 延迟最大允许倍数（默认 1.75）",
    )
    freeze_parser.add_argument(
        "--hit-rate-at-1-min-delta",
        type=float,
        default=-0.05,
        help="Top1 命中率最低允许变化（默认 -0.05）",
    )
    freeze_parser.add_argument(
        "--hit-rate-at-3-min-delta",
        type=float,
        default=-0.05,
        help="Top3 命中率最低允许变化（默认 -0.05）",
    )
    freeze_parser.add_argument(
        "--ndcg-at-5-min-delta",
        type=float,
        default=-0.05,
        help="nDCG@5 最低允许变化（默认 -0.05）",
    )
    freeze_parser.add_argument(
        "--rankable-case-coverage-rate-hard-floor",
        type=float,
        default=0.80,
        help="可评估排序样本覆盖率绝对下限（默认 0.80）",
    )
    freeze_parser.add_argument(
        "--explainability-rate-min-delta",
        type=float,
        default=-0.02,
        help="可解释率最低允许变化（默认 -0.02）",
    )
    freeze_parser.add_argument(
        "--continuity-rate-min-delta",
        type=float,
        default=-0.02,
        help="主流程可继续率最低允许变化（默认 -0.02）",
    )
    freeze_parser.add_argument(
        "--fallback-hit-rate-min-delta",
        type=float,
        default=-0.05,
        help="回退命中率最低允许变化（默认 -0.05）",
    )
    freeze_parser.add_argument(
        "--explainability-rate-hard-floor",
        type=float,
        default=0.95,
        help="可解释率绝对下限（默认 0.95）",
    )
    freeze_parser.add_argument(
        "--continuity-rate-hard-floor",
        type=float,
        default=0.95,
        help="主流程可继续率绝对下限（默认 0.95）",
    )

    check_parser = sub.add_parser("check", help="校验当前结果是否相对基线退化")
    check_parser.add_argument("--current", required=True, help="当前评测结果路径")
    check_parser.add_argument("--baseline", required=True, help="基线 JSON 路径")
    check_parser.add_argument(
        "--keyword-hit-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--keyword-coverage-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--fact-coverage-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--usable-top1-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--usable-top3-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--distractor-intrusion-rate-max-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--failure-rate-max-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--avg-latency-ms-max-ratio",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--p95-latency-ms-max-ratio",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--hit-rate-at-1-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--hit-rate-at-3-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--ndcg-at-5-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--rankable-case-coverage-rate-hard-floor",
        type=float,
        default=None,
        help="覆盖 hard floor（可选）",
    )
    check_parser.add_argument(
        "--explainability-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--continuity-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--fallback-hit-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--explainability-rate-hard-floor",
        type=float,
        default=None,
        help="覆盖 hard floor（可选）",
    )
    check_parser.add_argument(
        "--continuity-rate-hard-floor",
        type=float,
        default=None,
        help="覆盖 hard floor（可选）",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "freeze":
        g = Guardrails(
            keyword_hit_rate_min_delta=args.keyword_hit_rate_min_delta,
            keyword_coverage_rate_min_delta=args.keyword_coverage_rate_min_delta,
            fact_coverage_rate_min_delta=args.fact_coverage_rate_min_delta,
            usable_top1_rate_min_delta=args.usable_top1_rate_min_delta,
            usable_top3_rate_min_delta=args.usable_top3_rate_min_delta,
            distractor_intrusion_rate_max_delta=(
                args.distractor_intrusion_rate_max_delta
            ),
            failure_rate_max_delta=args.failure_rate_max_delta,
            avg_latency_ms_max_ratio=args.avg_latency_ms_max_ratio,
            p95_latency_ms_max_ratio=args.p95_latency_ms_max_ratio,
            hit_rate_at_1_min_delta=args.hit_rate_at_1_min_delta,
            hit_rate_at_3_min_delta=args.hit_rate_at_3_min_delta,
            ndcg_at_5_min_delta=args.ndcg_at_5_min_delta,
            rankable_case_coverage_rate_hard_floor=(
                args.rankable_case_coverage_rate_hard_floor
            ),
            explainability_rate_min_delta=args.explainability_rate_min_delta,
            continuity_rate_min_delta=args.continuity_rate_min_delta,
            fallback_hit_rate_min_delta=(args.fallback_hit_rate_min_delta),
            explainability_rate_hard_floor=(args.explainability_rate_hard_floor),
            continuity_rate_hard_floor=(args.continuity_rate_hard_floor),
        )
        payload = freeze_baseline(
            result_path=Path(args.result),
            output_path=Path(args.output),
            guardrails=g,
            notes=args.notes,
        )
        print(f"基线已生成: {args.output}")
        print(
            "指标快照: "
            f"keyword_hit_rate={payload['metrics']['keyword_hit_rate']:.2%}, "
            "keyword_coverage_rate="
            f"{payload['metrics'].get('keyword_coverage_rate', 0.0):.2%}, "
            "fact_coverage_rate="
            f"{payload['metrics'].get('fact_coverage_rate', 0.0):.2%}, "
            "usable_top1_rate="
            f"{payload['metrics'].get('usable_top1_rate', 0.0):.2%}, "
            "usable_top3_rate="
            f"{payload['metrics'].get('usable_top3_rate', 0.0):.2%}, "
            "distractor_intrusion_rate="
            f"{payload['metrics'].get('distractor_intrusion_rate', 0.0):.2%}, "
            f"failure_rate={payload['metrics']['failure_rate']:.2%}, "
            f"avg_latency_ms={payload['metrics']['avg_latency_ms']:.2f}, "
            f"p95_latency_ms={payload['metrics'].get('p95_latency_ms', 0.0):.2f}"
        )
        return 0

    if args.command == "check":
        override = None
        if any(
            [
                args.keyword_hit_rate_min_delta is not None,
                args.keyword_coverage_rate_min_delta is not None,
                args.fact_coverage_rate_min_delta is not None,
                args.usable_top1_rate_min_delta is not None,
                args.usable_top3_rate_min_delta is not None,
                args.distractor_intrusion_rate_max_delta is not None,
                args.failure_rate_max_delta is not None,
                args.avg_latency_ms_max_ratio is not None,
                args.p95_latency_ms_max_ratio is not None,
                args.hit_rate_at_1_min_delta is not None,
                args.hit_rate_at_3_min_delta is not None,
                args.ndcg_at_5_min_delta is not None,
                args.rankable_case_coverage_rate_hard_floor is not None,
                args.explainability_rate_min_delta is not None,
                args.continuity_rate_min_delta is not None,
                args.fallback_hit_rate_min_delta is not None,
                args.explainability_rate_hard_floor is not None,
                args.continuity_rate_hard_floor is not None,
            ]
        ):
            baseline_guardrails = _load_json(Path(args.baseline)).get("guardrails", {})
            override = Guardrails(
                keyword_hit_rate_min_delta=(
                    args.keyword_hit_rate_min_delta
                    if args.keyword_hit_rate_min_delta is not None
                    else baseline_guardrails.get("keyword_hit_rate_min_delta", -0.03)
                ),
                keyword_coverage_rate_min_delta=(
                    args.keyword_coverage_rate_min_delta
                    if args.keyword_coverage_rate_min_delta is not None
                    else baseline_guardrails.get(
                        "keyword_coverage_rate_min_delta", -0.03
                    )
                ),
                fact_coverage_rate_min_delta=(
                    args.fact_coverage_rate_min_delta
                    if args.fact_coverage_rate_min_delta is not None
                    else baseline_guardrails.get("fact_coverage_rate_min_delta", -0.03)
                ),
                usable_top1_rate_min_delta=(
                    args.usable_top1_rate_min_delta
                    if args.usable_top1_rate_min_delta is not None
                    else baseline_guardrails.get("usable_top1_rate_min_delta", -0.05)
                ),
                usable_top3_rate_min_delta=(
                    args.usable_top3_rate_min_delta
                    if args.usable_top3_rate_min_delta is not None
                    else baseline_guardrails.get("usable_top3_rate_min_delta", -0.03)
                ),
                distractor_intrusion_rate_max_delta=(
                    args.distractor_intrusion_rate_max_delta
                    if args.distractor_intrusion_rate_max_delta is not None
                    else baseline_guardrails.get(
                        "distractor_intrusion_rate_max_delta", 0.05
                    )
                ),
                failure_rate_max_delta=(
                    args.failure_rate_max_delta
                    if args.failure_rate_max_delta is not None
                    else baseline_guardrails.get("failure_rate_max_delta", 0.05)
                ),
                avg_latency_ms_max_ratio=(
                    args.avg_latency_ms_max_ratio
                    if args.avg_latency_ms_max_ratio is not None
                    else baseline_guardrails.get("avg_latency_ms_max_ratio", 1.50)
                ),
                p95_latency_ms_max_ratio=(
                    args.p95_latency_ms_max_ratio
                    if args.p95_latency_ms_max_ratio is not None
                    else baseline_guardrails.get("p95_latency_ms_max_ratio", 1.75)
                ),
                hit_rate_at_1_min_delta=(
                    args.hit_rate_at_1_min_delta
                    if args.hit_rate_at_1_min_delta is not None
                    else baseline_guardrails.get("hit_rate_at_1_min_delta", -0.05)
                ),
                hit_rate_at_3_min_delta=(
                    args.hit_rate_at_3_min_delta
                    if args.hit_rate_at_3_min_delta is not None
                    else baseline_guardrails.get("hit_rate_at_3_min_delta", -0.05)
                ),
                ndcg_at_5_min_delta=(
                    args.ndcg_at_5_min_delta
                    if args.ndcg_at_5_min_delta is not None
                    else baseline_guardrails.get("ndcg_at_5_min_delta", -0.05)
                ),
                rankable_case_coverage_rate_hard_floor=(
                    args.rankable_case_coverage_rate_hard_floor
                    if args.rankable_case_coverage_rate_hard_floor is not None
                    else baseline_guardrails.get(
                        "rankable_case_coverage_rate_hard_floor", 0.80
                    )
                ),
                explainability_rate_min_delta=(
                    args.explainability_rate_min_delta
                    if args.explainability_rate_min_delta is not None
                    else baseline_guardrails.get("explainability_rate_min_delta", -0.02)
                ),
                continuity_rate_min_delta=(
                    args.continuity_rate_min_delta
                    if args.continuity_rate_min_delta is not None
                    else baseline_guardrails.get("continuity_rate_min_delta", -0.02)
                ),
                fallback_hit_rate_min_delta=(
                    args.fallback_hit_rate_min_delta
                    if args.fallback_hit_rate_min_delta is not None
                    else baseline_guardrails.get("fallback_hit_rate_min_delta", -0.05)
                ),
                explainability_rate_hard_floor=(
                    args.explainability_rate_hard_floor
                    if args.explainability_rate_hard_floor is not None
                    else baseline_guardrails.get("explainability_rate_hard_floor", 0.95)
                ),
                continuity_rate_hard_floor=(
                    args.continuity_rate_hard_floor
                    if args.continuity_rate_hard_floor is not None
                    else baseline_guardrails.get("continuity_rate_hard_floor", 0.95)
                ),
            )

        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
            guardrails_override=override,
        )
        if passed:
            print("基线校验通过：未发现超阈值退化。")
            return 0

        print("基线校验失败：")
        for v in violations:
            print(f"- {v}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
