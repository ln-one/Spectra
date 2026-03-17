"""
D-8.5 模型路由质量门禁评测工具

核心指标：
1) quality_delta: 路由后平均质量相对基线（全量大模型）变化
2) latency_reduction_rate: 路由后平均延迟下降比例
3) cost_reduction_rate: 路由后平均成本下降比例
4) fallback_rate: 小模型失败/不达标后升级到大模型比例
5) non_degradable_misroute_rate: 不可降级任务被错误路由到小模型比例
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from services.model_router import ModelRouter

NON_DEGRADABLE_TASKS = {
    "rag_deep_summary",
    "lesson_plan_reasoning",
    "preview_modification",
}


@dataclass
class RouterQualityMetrics:
    total_samples: int
    avg_quality_before: float
    avg_quality_after: float
    avg_latency_before_ms: float
    avg_latency_after_ms: float
    avg_cost_before: float
    avg_cost_after: float
    quality_delta: float
    latency_reduction_rate: float
    cost_reduction_rate: float
    fallback_rate: float
    non_degradable_misroute_rate: float
    gate_passed: bool
    fallback_ids: list[str]
    failed_non_degradable_ids: list[str]
    failed_quality_ids: list[str]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"quality_delta={self.quality_delta:+.3f}, "
            f"latency_reduction={self.latency_reduction_rate:.1%}, "
            f"cost_reduction={self.cost_reduction_rate:.1%}, "
            f"fallback={self.fallback_rate:.1%}, "
            f"misroute={self.non_degradable_misroute_rate:.1%}, "
            f"gate_passed={self.gate_passed}"
        )


def _safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def compute_metrics(
    samples: list[dict],
    *,
    large_model: str = "qwen-max",
    small_model: str = "qwen-turbo",
    default_quality_floor: float = 0.85,
    max_avg_quality_drop: float = 0.02,
    max_non_degradable_misroute_rate: float = 0.0,
) -> RouterQualityMetrics:
    if not samples:
        return RouterQualityMetrics(
            total_samples=0,
            avg_quality_before=0.0,
            avg_quality_after=0.0,
            avg_latency_before_ms=0.0,
            avg_latency_after_ms=0.0,
            avg_cost_before=0.0,
            avg_cost_after=0.0,
            quality_delta=0.0,
            latency_reduction_rate=0.0,
            cost_reduction_rate=0.0,
            fallback_rate=0.0,
            non_degradable_misroute_rate=0.0,
            gate_passed=False,
            fallback_ids=[],
            failed_non_degradable_ids=[],
            failed_quality_ids=[],
        )

    router = ModelRouter(heavy_model=large_model, light_model=small_model)

    before_quality_sum = 0.0
    after_quality_sum = 0.0
    before_latency_sum = 0.0
    after_latency_sum = 0.0
    before_cost_sum = 0.0
    after_cost_sum = 0.0

    fallback_count = 0
    non_degradable_total = 0
    non_degradable_misroute_count = 0

    fallback_ids: list[str] = []
    failed_non_degradable_ids: list[str] = []
    failed_quality_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        task = str(sample.get("task", "") or "")
        prompt = str(sample.get("prompt", "") or "")
        has_rag_context = bool(sample.get("has_rag_context", False))

        quality_large = float(sample.get("quality_large", 0.0) or 0.0)
        quality_small = float(sample.get("quality_small", 0.0) or 0.0)
        latency_large_ms = float(sample.get("latency_large_ms", 0.0) or 0.0)
        latency_small_ms = float(sample.get("latency_small_ms", 0.0) or 0.0)
        cost_large = float(sample.get("cost_large", 0.0) or 0.0)
        cost_small = float(sample.get("cost_small", 0.0) or 0.0)
        quality_floor = float(
            sample.get("quality_floor", default_quality_floor) or default_quality_floor
        )
        small_success = bool(sample.get("small_model_success", True))
        is_non_degradable = bool(sample.get("non_degradable", False)) or (
            task in NON_DEGRADABLE_TASKS
        )

        decision = router.route(
            task=task,
            prompt=prompt,
            has_rag_context=has_rag_context,
        )
        routed_to_small = decision.selected_model == small_model

        if is_non_degradable:
            non_degradable_total += 1
            if routed_to_small:
                non_degradable_misroute_count += 1
                failed_non_degradable_ids.append(sample_id)

        before_quality_sum += quality_large
        before_latency_sum += latency_large_ms
        before_cost_sum += cost_large

        after_quality = quality_large
        after_latency = latency_large_ms
        after_cost = cost_large

        if routed_to_small:
            after_quality = quality_small
            after_latency = latency_small_ms
            after_cost = cost_small
            fallback_triggered = (not small_success) or (quality_small < quality_floor)
            if fallback_triggered:
                fallback_count += 1
                fallback_ids.append(sample_id)
                after_quality = quality_large
                after_latency = latency_small_ms + latency_large_ms
                after_cost = cost_small + cost_large

        is_critical = bool(sample.get("critical", False)) or is_non_degradable
        if is_critical and after_quality + 1e-8 < quality_large:
            failed_quality_ids.append(sample_id)

        after_quality_sum += after_quality
        after_latency_sum += after_latency
        after_cost_sum += after_cost

    total = len(samples)
    avg_quality_before = before_quality_sum / total
    avg_quality_after = after_quality_sum / total
    avg_latency_before = before_latency_sum / total
    avg_latency_after = after_latency_sum / total
    avg_cost_before = before_cost_sum / total
    avg_cost_after = after_cost_sum / total

    quality_delta = avg_quality_after - avg_quality_before
    latency_reduction_rate = _safe_div(
        avg_latency_before - avg_latency_after, avg_latency_before
    )
    cost_reduction_rate = _safe_div(avg_cost_before - avg_cost_after, avg_cost_before)
    fallback_rate = _safe_div(fallback_count, total)
    non_degradable_misroute_rate = _safe_div(
        non_degradable_misroute_count, non_degradable_total
    )

    gate_passed = (
        avg_quality_after >= (avg_quality_before - max_avg_quality_drop)
        and latency_reduction_rate >= 0.0
        and cost_reduction_rate >= 0.0
        and non_degradable_misroute_rate <= max_non_degradable_misroute_rate
        and len(failed_quality_ids) == 0
    )

    return RouterQualityMetrics(
        total_samples=total,
        avg_quality_before=avg_quality_before,
        avg_quality_after=avg_quality_after,
        avg_latency_before_ms=avg_latency_before,
        avg_latency_after_ms=avg_latency_after,
        avg_cost_before=avg_cost_before,
        avg_cost_after=avg_cost_after,
        quality_delta=quality_delta,
        latency_reduction_rate=latency_reduction_rate,
        cost_reduction_rate=cost_reduction_rate,
        fallback_rate=fallback_rate,
        non_degradable_misroute_rate=non_degradable_misroute_rate,
        gate_passed=gate_passed,
        fallback_ids=fallback_ids,
        failed_non_degradable_ids=failed_non_degradable_ids,
        failed_quality_ids=failed_quality_ids,
    )


def run_audit(
    dataset_path: Path,
    output_path: Path | None = None,
) -> RouterQualityMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    thresholds = dataset.get("thresholds", {}) or {}
    samples = dataset.get("samples", [])

    metrics = compute_metrics(
        samples,
        large_model=str(dataset.get("large_model", "qwen-max")),
        small_model=str(dataset.get("small_model", "qwen-turbo")),
        default_quality_floor=float(thresholds.get("default_quality_floor", 0.85)),
        max_avg_quality_drop=float(thresholds.get("max_avg_quality_drop", 0.02)),
        max_non_degradable_misroute_rate=float(
            thresholds.get("max_non_degradable_misroute_rate", 0.0)
        ),
    )

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "thresholds": {
                "default_quality_floor": float(
                    thresholds.get("default_quality_floor", 0.85)
                ),
                "max_avg_quality_drop": float(
                    thresholds.get("max_avg_quality_drop", 0.02)
                ),
                "max_non_degradable_misroute_rate": float(
                    thresholds.get("max_non_degradable_misroute_rate", 0.0)
                ),
            },
            "metrics": {
                "avg_quality_before": metrics.avg_quality_before,
                "avg_quality_after": metrics.avg_quality_after,
                "avg_latency_before_ms": metrics.avg_latency_before_ms,
                "avg_latency_after_ms": metrics.avg_latency_after_ms,
                "avg_cost_before": metrics.avg_cost_before,
                "avg_cost_after": metrics.avg_cost_after,
                "quality_delta": metrics.quality_delta,
                "latency_reduction_rate": metrics.latency_reduction_rate,
                "cost_reduction_rate": metrics.cost_reduction_rate,
                "fallback_rate": metrics.fallback_rate,
                "non_degradable_misroute_rate": metrics.non_degradable_misroute_rate,
                "gate_passed": metrics.gate_passed,
                "fallback_ids": metrics.fallback_ids,
                "failed_non_degradable_ids": metrics.failed_non_degradable_ids,
                "failed_quality_ids": metrics.failed_quality_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D-8.5 模型路由质量门禁评测")
    parser.add_argument(
        "--dataset",
        default="eval/router_quality_samples.json",
        help="评测样本路径",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="评测结果输出路径（可选）",
    )
    args = parser.parse_args()

    metrics = run_audit(
        dataset_path=Path(args.dataset),
        output_path=Path(args.output) if args.output else None,
    )
    print(metrics.summary())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
