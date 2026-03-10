"""
D6 对话资料记忆质量评测工具

核心指标：
1) hit_rate: 有参考资料问题中，回答是否命中期望来源
2) misquote_rate: 引用了不应引用的来源比例
3) no_hit_notice_rate: 无可用资料时，是否明确提示“未命中资料”
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class DialogueMemoryMetrics:
    total_samples: int
    hit_rate: float
    misquote_rate: float
    no_hit_notice_rate: float
    failed_hit_ids: list[str]
    failed_misquote_ids: list[str]
    failed_notice_ids: list[str]

    def summary(self) -> str:
        failed_count = (
            len(self.failed_hit_ids)
            + len(self.failed_misquote_ids)
            + len(self.failed_notice_ids)
        )
        return (
            f"total={self.total_samples}, "
            f"hit={self.hit_rate:.1%}, "
            f"misquote={self.misquote_rate:.1%}, "
            f"no_hit_notice={self.no_hit_notice_rate:.1%}, "
            f"failed={failed_count}"
        )


def compute_metrics(samples: list[dict]) -> DialogueMemoryMetrics:
    if not samples:
        return DialogueMemoryMetrics(0, 0.0, 0.0, 0.0, [], [], [])

    hit_total = 0
    hit_pass = 0

    misquote_total = 0
    misquote_count = 0

    no_hit_total = 0
    no_hit_notice_pass = 0

    failed_hit_ids: list[str] = []
    failed_misquote_ids: list[str] = []
    failed_notice_ids: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        expected = set(sample.get("expected_source_ids", []))
        used = set(sample.get("used_source_ids", []))
        has_notice = bool(sample.get("has_no_hit_notice", False))

        if expected:
            hit_total += 1
            if used & expected:
                hit_pass += 1
            else:
                failed_hit_ids.append(sample_id)
        else:
            no_hit_total += 1
            if has_notice:
                no_hit_notice_pass += 1
            else:
                failed_notice_ids.append(sample_id)

        misquote_total += 1
        if expected:
            wrong_refs = used - expected
            if wrong_refs:
                misquote_count += 1
                failed_misquote_ids.append(sample_id)
        elif used:
            misquote_count += 1
            failed_misquote_ids.append(sample_id)

    hit_rate = hit_pass / hit_total if hit_total > 0 else 0.0
    misquote_rate = misquote_count / misquote_total if misquote_total > 0 else 0.0
    no_hit_notice_rate = no_hit_notice_pass / no_hit_total if no_hit_total > 0 else 0.0

    return DialogueMemoryMetrics(
        total_samples=len(samples),
        hit_rate=hit_rate,
        misquote_rate=misquote_rate,
        no_hit_notice_rate=no_hit_notice_rate,
        failed_hit_ids=failed_hit_ids,
        failed_misquote_ids=failed_misquote_ids,
        failed_notice_ids=failed_notice_ids,
    )


def run_audit(
    dataset_path: Path, output_path: Path | None = None
) -> DialogueMemoryMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    metrics = compute_metrics(samples)

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "hit_rate": metrics.hit_rate,
                "misquote_rate": metrics.misquote_rate,
                "no_hit_notice_rate": metrics.no_hit_notice_rate,
                "failed_hit_ids": metrics.failed_hit_ids,
                "failed_misquote_ids": metrics.failed_misquote_ids,
                "failed_notice_ids": metrics.failed_notice_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D6 对话资料记忆质量评测")
    parser.add_argument(
        "--dataset",
        default="eval/dialogue_memory_samples.json",
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
