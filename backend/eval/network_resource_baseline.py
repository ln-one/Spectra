"""
Network resource quality baseline manager (D-8.6).

Usage:
    python eval/network_resource_baseline.py freeze \
      --result eval/results/network_resource_latest.json \
      --output eval/baselines/network-resource-baseline-v1.json

    python eval/network_resource_baseline.py check \
      --current eval/results/network_resource_latest.json \
      --baseline eval/baselines/network-resource-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    max_normalization_drop: float = 0.03
    max_relevance_drop: float = 0.03
    max_reject_drop: float = 0.03
    max_citation_ready_drop: float = 0.03


REQUIRED_METRICS = {
    "normalization_rate",
    "relevance_pass_rate",
    "low_quality_reject_rate",
    "citation_ready_rate",
    "gate_passed",
}


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
        "metrics": result["metrics"],
        "guardrails": {
            "max_normalization_drop": guardrails.max_normalization_drop,
            "max_relevance_drop": guardrails.max_relevance_drop,
            "max_reject_drop": guardrails.max_reject_drop,
            "max_citation_ready_drop": guardrails.max_citation_ready_drop,
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
        max_normalization_drop=baseline.get("guardrails", {}).get(
            "max_normalization_drop", 0.03
        ),
        max_relevance_drop=baseline.get("guardrails", {}).get(
            "max_relevance_drop", 0.03
        ),
        max_reject_drop=baseline.get("guardrails", {}).get("max_reject_drop", 0.03),
        max_citation_ready_drop=baseline.get("guardrails", {}).get(
            "max_citation_ready_drop", 0.03
        ),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]
    violations: list[str] = []

    normalization_min = base_m["normalization_rate"] - g.max_normalization_drop
    if curr_m["normalization_rate"] < normalization_min:
        violations.append(
            f"normalization_rate {curr_m['normalization_rate']:.2%} < "
            f"最低允许 {normalization_min:.2%}"
        )

    relevance_min = base_m["relevance_pass_rate"] - g.max_relevance_drop
    if curr_m["relevance_pass_rate"] < relevance_min:
        violations.append(
            f"relevance_pass_rate {curr_m['relevance_pass_rate']:.2%} < "
            f"最低允许 {relevance_min:.2%}"
        )

    reject_min = base_m["low_quality_reject_rate"] - g.max_reject_drop
    if curr_m["low_quality_reject_rate"] < reject_min:
        violations.append(
            f"low_quality_reject_rate {curr_m['low_quality_reject_rate']:.2%} < "
            f"最低允许 {reject_min:.2%}"
        )

    citation_min = base_m["citation_ready_rate"] - g.max_citation_ready_drop
    if curr_m["citation_ready_rate"] < citation_min:
        violations.append(
            f"citation_ready_rate {curr_m['citation_ready_rate']:.2%} < "
            f"最低允许 {citation_min:.2%}"
        )

    if not bool(curr_m["gate_passed"]):
        violations.append("gate_passed=false")

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D-8.6 网络资源基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结当前网络资源评测结果")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--max-normalization-drop",
        type=float,
        default=0.03,
        help="normalization_rate 最大允许下降值（默认 0.03）",
    )
    freeze_parser.add_argument(
        "--max-relevance-drop",
        type=float,
        default=0.03,
        help="relevance_pass_rate 最大允许下降值（默认 0.03）",
    )
    freeze_parser.add_argument(
        "--max-reject-drop",
        type=float,
        default=0.03,
        help="low_quality_reject_rate 最大允许下降值（默认 0.03）",
    )
    freeze_parser.add_argument(
        "--max-citation-ready-drop",
        type=float,
        default=0.03,
        help="citation_ready_rate 最大允许下降值（默认 0.03）",
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
                max_normalization_drop=args.max_normalization_drop,
                max_relevance_drop=args.max_relevance_drop,
                max_reject_drop=args.max_reject_drop,
                max_citation_ready_drop=args.max_citation_ready_drop,
            ),
            notes=args.notes,
        )
        print(f"网络资源基线已生成: {args.output}")
        print(
            "指标快照: "
            f"normalization={payload['metrics']['normalization_rate']:.2%}, "
            f"relevance={payload['metrics']['relevance_pass_rate']:.2%}, "
            f"citation={payload['metrics']['citation_ready_rate']:.2%}"
        )
        return 0

    if args.command == "check":
        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if passed:
            print("网络资源基线校验通过：未发现超阈值退化。")
            return 0

        print("网络资源基线校验失败：")
        for v in violations:
            print(f"- {v}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
