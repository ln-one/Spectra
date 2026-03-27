"""
PPT 插图质量专项抽样评测工具。

聚焦五类指标：
1) page_selection_pass_rate: 该插图的页是否真的被选中
2) placement_pass_rate: 图位是否稳定、便于讲解
3) quantity_pass_rate: 图片数量是否合理
4) layout_risk_control_pass_rate: 是否避免了高风险版式
5) text_image_alignment_pass_rate: 图文是否服务同一结论
6) overall_pass_rate: 是否可视为当前阶段可接入的插图结果
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

DIMENSIONS = (
    "page_selection",
    "placement",
    "quantity",
    "layout_risk_control",
    "text_image_alignment",
)


@dataclass
class PPTImageQualityMetrics:
    total_samples: int
    page_selection_pass_rate: float
    placement_pass_rate: float
    quantity_pass_rate: float
    layout_risk_control_pass_rate: float
    text_image_alignment_pass_rate: float
    overall_pass_rate: float
    failed_sample_ids: list[str]
    failed_by_dimension: dict[str, list[str]]
    issue_tag_counts: dict[str, int]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"selection={self.page_selection_pass_rate:.1%}, "
            f"placement={self.placement_pass_rate:.1%}, "
            f"quantity={self.quantity_pass_rate:.1%}, "
            f"risk={self.layout_risk_control_pass_rate:.1%}, "
            f"alignment={self.text_image_alignment_pass_rate:.1%}, "
            f"overall={self.overall_pass_rate:.1%}"
        )


def _sample_id(sample: dict, index: int) -> str:
    return sample.get("id") or f"sample-{index}"


def _load_passes(sample: dict) -> dict[str, bool]:
    passes = sample.get("passes")
    if not isinstance(passes, dict):
        return {dimension: False for dimension in DIMENSIONS}
    return {dimension: bool(passes.get(dimension, False)) for dimension in DIMENSIONS}


def compute_audit_metrics(samples: list[dict]) -> PPTImageQualityMetrics:
    if not samples:
        return PPTImageQualityMetrics(
            total_samples=0,
            page_selection_pass_rate=0.0,
            placement_pass_rate=0.0,
            quantity_pass_rate=0.0,
            layout_risk_control_pass_rate=0.0,
            text_image_alignment_pass_rate=0.0,
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
    return PPTImageQualityMetrics(
        total_samples=total,
        page_selection_pass_rate=passed_counts["page_selection"] / total,
        placement_pass_rate=passed_counts["placement"] / total,
        quantity_pass_rate=passed_counts["quantity"] / total,
        layout_risk_control_pass_rate=(passed_counts["layout_risk_control"] / total),
        text_image_alignment_pass_rate=(passed_counts["text_image_alignment"] / total),
        overall_pass_rate=overall_pass / total,
        failed_sample_ids=failed_sample_ids,
        failed_by_dimension=failed_by_dimension,
        issue_tag_counts=issue_tag_counts,
    )


def run_audit(
    dataset_path: Path, output_path: Path | None = None
) -> PPTImageQualityMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_audit_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "page_selection_pass_rate": metrics.page_selection_pass_rate,
                "placement_pass_rate": metrics.placement_pass_rate,
                "quantity_pass_rate": metrics.quantity_pass_rate,
                "layout_risk_control_pass_rate": (
                    metrics.layout_risk_control_pass_rate
                ),
                "text_image_alignment_pass_rate": (
                    metrics.text_image_alignment_pass_rate
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
    parser = argparse.ArgumentParser(description="PPT 插图质量专项评测")
    parser.add_argument(
        "--dataset",
        default="eval/ppt_image_quality_samples.json",
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
