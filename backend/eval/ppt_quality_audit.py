"""
PPT 生成质量抽样评测工具（P0 先行版）。

基于人工标注样本做六类指标：
1) structure_pass_rate: 页面结构是否清晰
2) information_density_pass_rate: 信息密度是否适中
3) visual_balance_pass_rate: 图文比例与版面平衡是否合格
4) expression_pass_rate: 教学表达是否清楚
5) image_match_pass_rate: 图片/素材是否与内容匹配
6) overall_pass_rate: 是否可视为当前阶段可展示结果

输入样本格式示例见 eval/ppt_quality_samples.json。
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


DIMENSIONS = (
    "structure",
    "information_density",
    "visual_balance",
    "expression",
    "image_match",
)


@dataclass
class PPTQualityMetrics:
    total_samples: int
    structure_pass_rate: float
    information_density_pass_rate: float
    visual_balance_pass_rate: float
    expression_pass_rate: float
    image_match_pass_rate: float
    overall_pass_rate: float
    failed_sample_ids: list[str]
    failed_by_dimension: dict[str, list[str]]
    issue_tag_counts: dict[str, int]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"structure={self.structure_pass_rate:.1%}, "
            f"density={self.information_density_pass_rate:.1%}, "
            f"visual={self.visual_balance_pass_rate:.1%}, "
            f"expression={self.expression_pass_rate:.1%}, "
            f"image_match={self.image_match_pass_rate:.1%}, "
            f"overall={self.overall_pass_rate:.1%}"
        )


def _sample_id(sample: dict, index: int) -> str:
    return sample.get("id") or f"sample-{index}"


def _load_passes(sample: dict) -> dict[str, bool]:
    passes = sample.get("passes")
    if not isinstance(passes, dict):
        return {dimension: False for dimension in DIMENSIONS}
    return {dimension: bool(passes.get(dimension, False)) for dimension in DIMENSIONS}


def compute_audit_metrics(samples: list[dict]) -> PPTQualityMetrics:
    if not samples:
        return PPTQualityMetrics(
            total_samples=0,
            structure_pass_rate=0.0,
            information_density_pass_rate=0.0,
            visual_balance_pass_rate=0.0,
            expression_pass_rate=0.0,
            image_match_pass_rate=0.0,
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
    return PPTQualityMetrics(
        total_samples=total,
        structure_pass_rate=passed_counts["structure"] / total,
        information_density_pass_rate=passed_counts["information_density"] / total,
        visual_balance_pass_rate=passed_counts["visual_balance"] / total,
        expression_pass_rate=passed_counts["expression"] / total,
        image_match_pass_rate=passed_counts["image_match"] / total,
        overall_pass_rate=overall_pass / total,
        failed_sample_ids=failed_sample_ids,
        failed_by_dimension=failed_by_dimension,
        issue_tag_counts=issue_tag_counts,
    )


def run_audit(dataset_path: Path, output_path: Path | None = None) -> PPTQualityMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_audit_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "structure_pass_rate": metrics.structure_pass_rate,
                "information_density_pass_rate": (
                    metrics.information_density_pass_rate
                ),
                "visual_balance_pass_rate": metrics.visual_balance_pass_rate,
                "expression_pass_rate": metrics.expression_pass_rate,
                "image_match_pass_rate": metrics.image_match_pass_rate,
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
    parser = argparse.ArgumentParser(description="PPT 质量抽样评测")
    parser.add_argument(
        "--dataset",
        default="eval/ppt_quality_samples.json",
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
