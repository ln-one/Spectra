"""
D7 大纲流质量评测工具（Gamma 风格）

评测三阶段：
1) draft_structure_pass_rate: 初稿结构完整率
2) rewrite_improvement_rate: 重写后质量提升率
3) confirm_ready_rate: 确认阶段可进入生成比例
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class OutlineFlowMetrics:
    total_samples: int
    draft_structure_pass_rate: float
    rewrite_improvement_rate: float
    confirm_ready_rate: float
    failed_draft_ids: list[str]
    failed_rewrite_ids: list[str]
    failed_confirm_ids: list[str]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"draft_pass={self.draft_structure_pass_rate:.1%}, "
            f"rewrite_improve={self.rewrite_improvement_rate:.1%}, "
            f"confirm_ready={self.confirm_ready_rate:.1%}"
        )


def _is_draft_valid(sample: dict) -> bool:
    draft = sample.get("draft_outline") or {}
    sections = draft.get("sections") or []
    return len(sections) >= int(sample.get("min_sections", 3))


def _is_rewrite_improved(sample: dict) -> bool:
    draft_score = float(sample.get("draft_score", 0.0))
    rewrite_score = float(sample.get("rewrite_score", 0.0))
    return rewrite_score > draft_score


def _is_confirm_ready(sample: dict) -> bool:
    confirm = sample.get("confirm_outline") or {}
    sections = confirm.get("sections") or []
    if len(sections) < int(sample.get("min_sections", 3)):
        return False
    return bool(sample.get("confirm_ready", False))


def compute_metrics(samples: list[dict]) -> OutlineFlowMetrics:
    if not samples:
        return OutlineFlowMetrics(0, 0.0, 0.0, 0.0, [], [], [])

    draft_pass = 0
    rewrite_pass = 0
    confirm_pass = 0
    failed_draft_ids: list[str] = []
    failed_rewrite_ids: list[str] = []
    failed_confirm_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")

        if _is_draft_valid(sample):
            draft_pass += 1
        else:
            failed_draft_ids.append(sample_id)

        if _is_rewrite_improved(sample):
            rewrite_pass += 1
        else:
            failed_rewrite_ids.append(sample_id)

        if _is_confirm_ready(sample):
            confirm_pass += 1
        else:
            failed_confirm_ids.append(sample_id)

    total = len(samples)
    return OutlineFlowMetrics(
        total_samples=total,
        draft_structure_pass_rate=draft_pass / total,
        rewrite_improvement_rate=rewrite_pass / total,
        confirm_ready_rate=confirm_pass / total,
        failed_draft_ids=failed_draft_ids,
        failed_rewrite_ids=failed_rewrite_ids,
        failed_confirm_ids=failed_confirm_ids,
    )


def run_audit(
    dataset_path: Path, output_path: Path | None = None
) -> OutlineFlowMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "draft_structure_pass_rate": metrics.draft_structure_pass_rate,
                "rewrite_improvement_rate": metrics.rewrite_improvement_rate,
                "confirm_ready_rate": metrics.confirm_ready_rate,
                "failed_draft_ids": metrics.failed_draft_ids,
                "failed_rewrite_ids": metrics.failed_rewrite_ids,
                "failed_confirm_ids": metrics.failed_confirm_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D7 大纲流质量评测")
    parser.add_argument(
        "--dataset",
        default="eval/outline_flow_samples.json",
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
