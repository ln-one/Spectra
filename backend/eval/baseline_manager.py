"""
RAG 评测基线管理工具

用法示例：
    # 冻结当前评测结果为基线
    python eval/baseline_manager.py freeze \
      --result eval/results/latest.json \
      --output eval/baselines/rag-baseline-v1.json

    # 校验当前结果是否退化
    python eval/baseline_manager.py check \
      --current eval/results/latest.json \
      --baseline eval/baselines/rag-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    """基线门禁阈值。"""

    keyword_hit_rate_min_delta: float = -0.03
    failure_rate_max_delta: float = 0.05
    avg_latency_ms_max_ratio: float = 1.50


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_result_payload(payload: dict, source: Path) -> None:
    if "metrics" not in payload:
        raise ValueError(f"{source} 缺少 metrics 字段")
    metrics = payload["metrics"]
    required = {"keyword_hit_rate", "failure_rate", "avg_latency_ms"}
    missing = [k for k in required if k not in metrics]
    if missing:
        raise ValueError(f"{source} 缺少指标字段: {', '.join(missing)}")


def freeze_baseline(
    result_path: Path,
    output_path: Path,
    guardrails: Guardrails,
    notes: str | None,
) -> dict:
    result = _load_json(result_path)
    _validate_result_payload(result, result_path)

    payload = {
        "baseline_version": "1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_result": str(result_path),
        "notes": notes,
        "tool_version": result.get("tool_version"),
        "dataset_version": result.get("dataset_version"),
        "dataset_path": result.get("dataset_path"),
        "dataset_sha256": result.get("dataset_sha256"),
        "top_k": result.get("top_k"),
        "metrics": result["metrics"],
        "guardrails": {
            "keyword_hit_rate_min_delta": guardrails.keyword_hit_rate_min_delta,
            "failure_rate_max_delta": guardrails.failure_rate_max_delta,
            "avg_latency_ms_max_ratio": guardrails.avg_latency_ms_max_ratio,
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


def check_regression(
    current_path: Path,
    baseline_path: Path,
    guardrails_override: Guardrails | None = None,
) -> tuple[bool, list[str]]:
    current = _load_json(current_path)
    baseline = _load_json(baseline_path)
    _validate_result_payload(current, current_path)

    baseline_metrics = baseline.get("metrics", {})
    _validate_result_payload({"metrics": baseline_metrics}, baseline_path)

    g = guardrails_override or Guardrails(
        keyword_hit_rate_min_delta=baseline.get("guardrails", {}).get(
            "keyword_hit_rate_min_delta", -0.03
        ),
        failure_rate_max_delta=baseline.get("guardrails", {}).get(
            "failure_rate_max_delta", 0.05
        ),
        avg_latency_ms_max_ratio=baseline.get("guardrails", {}).get(
            "avg_latency_ms_max_ratio", 1.50
        ),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]

    violations: list[str] = []

    keyword_delta = curr_m["keyword_hit_rate"] - base_m["keyword_hit_rate"]
    if keyword_delta < g.keyword_hit_rate_min_delta:
        violations.append(
            f"keyword_hit_rate 下降 {keyword_delta:.2%} "
            f"(阈值 {g.keyword_hit_rate_min_delta:.2%})"
        )

    failure_delta = curr_m["failure_rate"] - base_m["failure_rate"]
    if failure_delta > g.failure_rate_max_delta:
        violations.append(
            f"failure_rate 上升 {failure_delta:.2%} "
            f"(阈值 {g.failure_rate_max_delta:.2%})"
        )

    base_latency = base_m["avg_latency_ms"]
    curr_latency = curr_m["avg_latency_ms"]
    if base_latency <= 0:
        if curr_latency > 0:
            violations.append("baseline avg_latency_ms 为 0，无法进行比例比较")
    else:
        latency_ratio = curr_latency / base_latency
        if latency_ratio > g.avg_latency_ms_max_ratio:
            violations.append(
                f"avg_latency_ms 比例 {latency_ratio:.2f}x "
                f"(阈值 {g.avg_latency_ms_max_ratio:.2f}x)"
            )

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="RAG 基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结评测结果为基线")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--keyword-hit-rate-min-delta",
        type=float,
        default=-0.03,
        help="关键词命中率最低允许变化（默认 -0.03）",
    )
    freeze_parser.add_argument(
        "--failure-rate-max-delta",
        type=float,
        default=0.05,
        help="失败率最大允许上升（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--avg-latency-ms-max-ratio",
        type=float,
        default=1.50,
        help="平均延迟最大允许倍数（默认 1.50）",
    )

    check_parser = sub.add_parser("check", help="校验当前结果是否相对基线退化")
    check_parser.add_argument("--current", required=True, help="当前评测结果路径")
    check_parser.add_argument("--baseline", required=True, help="基线 JSON 路径")
    check_parser.add_argument(
        "--keyword-hit-rate-min-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--failure-rate-max-delta",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    check_parser.add_argument(
        "--avg-latency-ms-max-ratio",
        type=float,
        default=None,
        help="覆盖基线阈值（可选）",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "freeze":
        g = Guardrails(
            keyword_hit_rate_min_delta=args.keyword_hit_rate_min_delta,
            failure_rate_max_delta=args.failure_rate_max_delta,
            avg_latency_ms_max_ratio=args.avg_latency_ms_max_ratio,
        )
        payload = freeze_baseline(
            result_path=Path(args.result),
            output_path=Path(args.output),
            guardrails=g,
            notes=args.notes,
        )
        print(f"基线已生成: {args.output}")
        print(
            "指标快照: "
            f"keyword_hit_rate={payload['metrics']['keyword_hit_rate']:.2%}, "
            f"failure_rate={payload['metrics']['failure_rate']:.2%}, "
            f"avg_latency_ms={payload['metrics']['avg_latency_ms']:.2f}"
        )
        return 0

    if args.command == "check":
        override = None
        if any(
            [
                args.keyword_hit_rate_min_delta is not None,
                args.failure_rate_max_delta is not None,
                args.avg_latency_ms_max_ratio is not None,
            ]
        ):
            override = Guardrails(
                keyword_hit_rate_min_delta=(
                    args.keyword_hit_rate_min_delta
                    if args.keyword_hit_rate_min_delta is not None
                    else -0.03
                ),
                failure_rate_max_delta=(
                    args.failure_rate_max_delta
                    if args.failure_rate_max_delta is not None
                    else 0.05
                ),
                avg_latency_ms_max_ratio=(
                    args.avg_latency_ms_max_ratio
                    if args.avg_latency_ms_max_ratio is not None
                    else 1.50
                ),
            )

        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
            guardrails_override=override,
        )
        if passed:
            print("基线校验通过：未发现超阈值退化。")
            return 0

        print("基线校验失败：")
        for v in violations:
            print(f"- {v}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
