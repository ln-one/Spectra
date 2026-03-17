"""
Router quality baseline manager (D-8.5).

Usage:
    python eval/router_quality_baseline.py freeze \
      --result eval/results/router_quality_latest.json \
      --output eval/baselines/router-quality-baseline-v1.json

    python eval/router_quality_baseline.py check \
      --current eval/results/router_quality_latest.json \
      --baseline eval/baselines/router-quality-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    max_quality_delta_drop: float = 0.02
    max_latency_reduction_drop: float = 0.05
    max_cost_reduction_drop: float = 0.05
    max_fallback_rate_increase: float = 0.10
    max_non_degradable_misroute_rate: float = 0.0


REQUIRED_METRICS = {
    "quality_delta",
    "latency_reduction_rate",
    "cost_reduction_rate",
    "fallback_rate",
    "non_degradable_misroute_rate",
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
            "max_quality_delta_drop": guardrails.max_quality_delta_drop,
            "max_latency_reduction_drop": guardrails.max_latency_reduction_drop,
            "max_cost_reduction_drop": guardrails.max_cost_reduction_drop,
            "max_fallback_rate_increase": guardrails.max_fallback_rate_increase,
            "max_non_degradable_misroute_rate": guardrails.max_non_degradable_misroute_rate,
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
        max_quality_delta_drop=baseline.get("guardrails", {}).get(
            "max_quality_delta_drop", 0.02
        ),
        max_latency_reduction_drop=baseline.get("guardrails", {}).get(
            "max_latency_reduction_drop", 0.05
        ),
        max_cost_reduction_drop=baseline.get("guardrails", {}).get(
            "max_cost_reduction_drop", 0.05
        ),
        max_fallback_rate_increase=baseline.get("guardrails", {}).get(
            "max_fallback_rate_increase", 0.10
        ),
        max_non_degradable_misroute_rate=baseline.get("guardrails", {}).get(
            "max_non_degradable_misroute_rate", 0.0
        ),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]

    violations: list[str] = []

    quality_min = base_m["quality_delta"] - g.max_quality_delta_drop
    if curr_m["quality_delta"] < quality_min:
        violations.append(
            f"quality_delta {curr_m['quality_delta']:.3f} < 最低允许 {quality_min:.3f}"
        )

    latency_min = (
        base_m["latency_reduction_rate"] - g.max_latency_reduction_drop
    )
    if curr_m["latency_reduction_rate"] < latency_min:
        violations.append(
            "latency_reduction_rate "
            f"{curr_m['latency_reduction_rate']:.2%} < 最低允许 {latency_min:.2%}"
        )

    cost_min = base_m["cost_reduction_rate"] - g.max_cost_reduction_drop
    if curr_m["cost_reduction_rate"] < cost_min:
        violations.append(
            f"cost_reduction_rate {curr_m['cost_reduction_rate']:.2%} < "
            f"最低允许 {cost_min:.2%}"
        )

    fallback_max = base_m["fallback_rate"] + g.max_fallback_rate_increase
    if curr_m["fallback_rate"] > fallback_max:
        violations.append(
            f"fallback_rate {curr_m['fallback_rate']:.2%} > "
            f"最大允许 {fallback_max:.2%}"
        )

    if (
        curr_m["non_degradable_misroute_rate"]
        > g.max_non_degradable_misroute_rate
    ):
        violations.append(
            "non_degradable_misroute_rate "
            f"{curr_m['non_degradable_misroute_rate']:.2%} > "
            f"最大允许 {g.max_non_degradable_misroute_rate:.2%}"
        )

    if not bool(curr_m["gate_passed"]):
        violations.append("gate_passed=false")

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D-8.5 路由质量基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结当前路由评测结果")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--max-quality-delta-drop",
        type=float,
        default=0.02,
        help="quality_delta 最大允许下降值（默认 0.02）",
    )
    freeze_parser.add_argument(
        "--max-latency-reduction-drop",
        type=float,
        default=0.05,
        help="latency_reduction_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-cost-reduction-drop",
        type=float,
        default=0.05,
        help="cost_reduction_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-fallback-rate-increase",
        type=float,
        default=0.10,
        help="fallback_rate 最大允许上升值（默认 0.10）",
    )
    freeze_parser.add_argument(
        "--max-non-degradable-misroute-rate",
        type=float,
        default=0.0,
        help="不可降级误路由率上限（默认 0.0）",
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
                max_quality_delta_drop=args.max_quality_delta_drop,
                max_latency_reduction_drop=args.max_latency_reduction_drop,
                max_cost_reduction_drop=args.max_cost_reduction_drop,
                max_fallback_rate_increase=args.max_fallback_rate_increase,
                max_non_degradable_misroute_rate=args.max_non_degradable_misroute_rate,
            ),
            notes=args.notes,
        )
        print(f"路由基线已生成: {args.output}")
        print(
            "指标快照: "
            f"quality_delta={payload['metrics']['quality_delta']:+.3f}, "
            f"latency_reduction_rate={payload['metrics']['latency_reduction_rate']:.2%}, "
            f"cost_reduction_rate={payload['metrics']['cost_reduction_rate']:.2%}"
        )
        return 0

    if args.command == "check":
        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if passed:
            print("路由基线校验通过：未发现超阈值退化。")
            return 0

        print("路由基线校验失败：")
        for v in violations:
            print(f"- {v}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
