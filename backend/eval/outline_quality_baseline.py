"""
Outline quality baseline manager (P0).

Usage:
    python eval/outline_quality_baseline.py freeze \
      --result eval/results/outline_quality_latest.json \
      --output eval/baselines/outline-quality-baseline-v1.json

    python eval/outline_quality_baseline.py check \
      --current eval/results/outline_quality_latest.json \
      --baseline eval/baselines/outline-quality-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_METRICS = {
    "title_uniqueness_pass_rate",
    "key_point_uniqueness_pass_rate",
    "cross_section_progression_pass_rate",
    "expression_specificity_pass_rate",
    "overall_pass_rate",
}


@dataclass
class Guardrails:
    max_title_uniqueness_drop: float = 0.05
    max_key_point_uniqueness_drop: float = 0.05
    max_cross_section_progression_drop: float = 0.05
    max_expression_specificity_drop: float = 0.05
    max_overall_drop: float = 0.05


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_payload(payload: dict, source: Path) -> None:
    metrics = payload.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError(f"{source} 缺少 metrics 对象")
    missing = [key for key in REQUIRED_METRICS if key not in metrics]
    if missing:
        raise ValueError(f"{source} 缺少指标字段: {', '.join(missing)}")


def freeze_baseline(
    result_path: Path,
    output_path: Path,
    guardrails: Guardrails,
    notes: str | None = None,
) -> dict:
    result = _load_json(result_path)
    _validate_payload(result, result_path)

    payload = {
        "baseline_version": "1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_result": str(result_path),
        "notes": notes,
        "dataset": result.get("dataset"),
        "total_samples": result.get("total_samples"),
        "metrics": result["metrics"],
        "guardrails": {
            "max_title_uniqueness_drop": guardrails.max_title_uniqueness_drop,
            "max_key_point_uniqueness_drop": guardrails.max_key_point_uniqueness_drop,
            "max_cross_section_progression_drop": (
                guardrails.max_cross_section_progression_drop
            ),
            "max_expression_specificity_drop": (
                guardrails.max_expression_specificity_drop
            ),
            "max_overall_drop": guardrails.max_overall_drop,
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def check_regression(
    current_path: Path,
    baseline_path: Path,
    guardrails_override: Guardrails | None = None,
) -> tuple[bool, list[str]]:
    current = _load_json(current_path)
    baseline = _load_json(baseline_path)
    _validate_payload(current, current_path)
    _validate_payload(baseline, baseline_path)

    g = guardrails_override or Guardrails(
        max_title_uniqueness_drop=baseline.get("guardrails", {}).get(
            "max_title_uniqueness_drop", 0.05
        ),
        max_key_point_uniqueness_drop=baseline.get("guardrails", {}).get(
            "max_key_point_uniqueness_drop", 0.05
        ),
        max_cross_section_progression_drop=baseline.get("guardrails", {}).get(
            "max_cross_section_progression_drop", 0.05
        ),
        max_expression_specificity_drop=baseline.get("guardrails", {}).get(
            "max_expression_specificity_drop", 0.05
        ),
        max_overall_drop=baseline.get("guardrails", {}).get("max_overall_drop", 0.05),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]
    violations: list[str] = []

    def _check_rate(metric_name: str, max_drop: float) -> None:
        minimum = base_m[metric_name] - max_drop
        if curr_m[metric_name] < minimum:
            violations.append(
                f"{metric_name} {curr_m[metric_name]:.2%} < 最低允许 {minimum:.2%}"
            )

    _check_rate("title_uniqueness_pass_rate", g.max_title_uniqueness_drop)
    _check_rate("key_point_uniqueness_pass_rate", g.max_key_point_uniqueness_drop)
    _check_rate(
        "cross_section_progression_pass_rate",
        g.max_cross_section_progression_drop,
    )
    _check_rate(
        "expression_specificity_pass_rate",
        g.max_expression_specificity_drop,
    )
    _check_rate("overall_pass_rate", g.max_overall_drop)

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="大纲重复质量基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结当前大纲质量评测结果")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--max-title-uniqueness-drop",
        type=float,
        default=0.05,
        help="title_uniqueness_pass_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-key-point-uniqueness-drop",
        type=float,
        default=0.05,
        help="key_point_uniqueness_pass_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-cross-section-progression-drop",
        type=float,
        default=0.05,
        help="cross_section_progression_pass_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-expression-specificity-drop",
        type=float,
        default=0.05,
        help="expression_specificity_pass_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-overall-drop",
        type=float,
        default=0.05,
        help="overall_pass_rate 最大允许下降值（默认 0.05）",
    )

    check_parser = sub.add_parser("check", help="校验当前结果是否退化")
    check_parser.add_argument("--current", required=True, help="当前结果路径")
    check_parser.add_argument("--baseline", required=True, help="基线路径")
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "freeze":
        payload = freeze_baseline(
            result_path=Path(args.result),
            output_path=Path(args.output),
            guardrails=Guardrails(
                max_title_uniqueness_drop=args.max_title_uniqueness_drop,
                max_key_point_uniqueness_drop=args.max_key_point_uniqueness_drop,
                max_cross_section_progression_drop=(
                    args.max_cross_section_progression_drop
                ),
                max_expression_specificity_drop=args.max_expression_specificity_drop,
                max_overall_drop=args.max_overall_drop,
            ),
            notes=args.notes,
        )
        print(f"大纲质量基线已生成: {args.output}")
        print(
            "指标快照: "
            f"title={payload['metrics']['title_uniqueness_pass_rate']:.2%}, "
            f"keypoint={payload['metrics']['key_point_uniqueness_pass_rate']:.2%}, "
            f"overall={payload['metrics']['overall_pass_rate']:.2%}"
        )
        return 0

    if args.command == "check":
        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if passed:
            print("大纲质量基线校验通过：未发现超阈值退化。")
            return 0

        print("大纲质量基线校验失败：")
        for violation in violations:
            print(f"- {violation}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
