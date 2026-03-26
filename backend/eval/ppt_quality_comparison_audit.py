"""
PPT 质量前后对照评测工具（P0）。

基于人工标注的 before/after 样本对，评估：
1) overall_improvement_rate: 整体质量是否提升
2) dimension_improvement_rate: 各维度提升率
3) regressions: 哪些样本在优化后未改善或退化
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from eval.ppt_quality_audit import DIMENSIONS


@dataclass
class ComparisonMetrics:
    total_samples: int
    overall_improvement_rate: float
    dimension_improvement_rate: dict[str, float]
    improved_sample_ids: list[str]
    non_improved_sample_ids: list[str]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"overall_improvement={self.overall_improvement_rate:.1%}, "
            f"non_improved={len(self.non_improved_sample_ids)}"
        )


def _load_passes(payload: dict) -> dict[str, bool]:
    passes = payload.get("passes")
    if not isinstance(passes, dict):
        return {dimension: False for dimension in DIMENSIONS}
    return {dimension: bool(passes.get(dimension, False)) for dimension in DIMENSIONS}


def _score(passes: dict[str, bool]) -> int:
    return sum(1 for value in passes.values() if value)


def compute_metrics(samples: list[dict]) -> ComparisonMetrics:
    if not samples:
        return ComparisonMetrics(
            total_samples=0,
            overall_improvement_rate=0.0,
            dimension_improvement_rate={dimension: 0.0 for dimension in DIMENSIONS},
            improved_sample_ids=[],
            non_improved_sample_ids=[],
        )

    improved_sample_ids: list[str] = []
    non_improved_sample_ids: list[str] = []
    improved_counts = {dimension: 0 for dimension in DIMENSIONS}

    for index, sample in enumerate(samples, start=1):
        sample_id = sample.get("id") or f"sample-{index}"
        before = _load_passes(sample.get("before") or {})
        after = _load_passes(sample.get("after") or {})

        before_score = _score(before)
        after_score = _score(after)
        if after_score > before_score:
            improved_sample_ids.append(sample_id)
        else:
            non_improved_sample_ids.append(sample_id)

        for dimension in DIMENSIONS:
            if (not before[dimension]) and after[dimension]:
                improved_counts[dimension] += 1

    total = len(samples)
    return ComparisonMetrics(
        total_samples=total,
        overall_improvement_rate=len(improved_sample_ids) / total,
        dimension_improvement_rate={
            dimension: improved_counts[dimension] / total for dimension in DIMENSIONS
        },
        improved_sample_ids=improved_sample_ids,
        non_improved_sample_ids=non_improved_sample_ids,
    )


def run_audit(dataset_path: Path, output_path: Path | None = None) -> ComparisonMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "overall_improvement_rate": metrics.overall_improvement_rate,
                "dimension_improvement_rate": metrics.dimension_improvement_rate,
                "improved_sample_ids": metrics.improved_sample_ids,
                "non_improved_sample_ids": metrics.non_improved_sample_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="PPT 质量前后对照评测")
    parser.add_argument(
        "--dataset",
        default="eval/ppt_quality_comparison_samples.json",
        help="前后对照样本路径",
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
