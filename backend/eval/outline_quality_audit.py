"""
大纲重复问题抽样评测工具（P0）。

基于人工标注样本做四类指标：
1) title_uniqueness_pass_rate: 章节标题是否不重复
2) key_point_uniqueness_pass_rate: 关键要点是否不重复
3) cross_section_progression_pass_rate: 相邻章节是否推进而非原地复述
4) expression_specificity_pass_rate: 标题与要点是否足够具体
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

DIMENSIONS = (
    "title_uniqueness",
    "key_point_uniqueness",
    "cross_section_progression",
    "expression_specificity",
)


@dataclass
class OutlineQualityMetrics:
    total_samples: int
    title_uniqueness_pass_rate: float
    key_point_uniqueness_pass_rate: float
    cross_section_progression_pass_rate: float
    expression_specificity_pass_rate: float
    overall_pass_rate: float
    failed_sample_ids: list[str]
    failed_by_dimension: dict[str, list[str]]
    issue_tag_counts: dict[str, int]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"title_unique={self.title_uniqueness_pass_rate:.1%}, "
            f"keypoint_unique={self.key_point_uniqueness_pass_rate:.1%}, "
            f"progression={self.cross_section_progression_pass_rate:.1%}, "
            f"specificity={self.expression_specificity_pass_rate:.1%}, "
            f"overall={self.overall_pass_rate:.1%}"
        )


def _sample_id(sample: dict, index: int) -> str:
    return sample.get("id") or f"sample-{index}"


def _load_passes(sample: dict) -> dict[str, bool]:
    passes = sample.get("passes")
    if not isinstance(passes, dict):
        return {dimension: False for dimension in DIMENSIONS}
    return {dimension: bool(passes.get(dimension, False)) for dimension in DIMENSIONS}


def compute_audit_metrics(samples: list[dict]) -> OutlineQualityMetrics:
    if not samples:
        return OutlineQualityMetrics(
            total_samples=0,
            title_uniqueness_pass_rate=0.0,
            key_point_uniqueness_pass_rate=0.0,
            cross_section_progression_pass_rate=0.0,
            expression_specificity_pass_rate=0.0,
            overall_pass_rate=0.0,
            failed_sample_ids=[],
            failed_by_dimension={dimension: [] for dimension in DIMENSIONS},
            issue_tag_counts={},
        )

    passed_counts = {dimension: 0 for dimension in DIMENSIONS}
    failed_by_dimension = {dimension: [] for dimension in DIMENSIONS}
    failed_sample_ids: list[str] = []
    issue_tag_counts: dict[str, int] = {}
    overall_pass = 0

    for index, sample in enumerate(samples, start=1):
        sample_id = _sample_id(sample, index)
        passes = _load_passes(sample)
        sample_ok = True

        for dimension in DIMENSIONS:
            if passes[dimension]:
                passed_counts[dimension] += 1
            else:
                failed_by_dimension[dimension].append(sample_id)
                sample_ok = False

        if sample_ok:
            overall_pass += 1
        else:
            failed_sample_ids.append(sample_id)

        for tag in sample.get("issues") or []:
            issue_tag_counts[tag] = issue_tag_counts.get(tag, 0) + 1

    total = len(samples)
    return OutlineQualityMetrics(
        total_samples=total,
        title_uniqueness_pass_rate=passed_counts["title_uniqueness"] / total,
        key_point_uniqueness_pass_rate=passed_counts["key_point_uniqueness"] / total,
        cross_section_progression_pass_rate=(
            passed_counts["cross_section_progression"] / total
        ),
        expression_specificity_pass_rate=(
            passed_counts["expression_specificity"] / total
        ),
        overall_pass_rate=overall_pass / total,
        failed_sample_ids=failed_sample_ids,
        failed_by_dimension=failed_by_dimension,
        issue_tag_counts=issue_tag_counts,
    )


def run_audit(
    dataset_path: Path, output_path: Path | None = None
) -> OutlineQualityMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_audit_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "title_uniqueness_pass_rate": metrics.title_uniqueness_pass_rate,
                "key_point_uniqueness_pass_rate": (
                    metrics.key_point_uniqueness_pass_rate
                ),
                "cross_section_progression_pass_rate": (
                    metrics.cross_section_progression_pass_rate
                ),
                "expression_specificity_pass_rate": (
                    metrics.expression_specificity_pass_rate
                ),
                "overall_pass_rate": metrics.overall_pass_rate,
                "failed_sample_ids": metrics.failed_sample_ids,
                "failed_by_dimension": metrics.failed_by_dimension,
                "issue_tag_counts": metrics.issue_tag_counts,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="大纲重复问题抽样评测")
    parser.add_argument(
        "--dataset",
        default="eval/outline_quality_samples.json",
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
