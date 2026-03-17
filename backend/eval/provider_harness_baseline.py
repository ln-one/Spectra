"""
Provider harness baseline manager (D1).

Usage:
    python eval/provider_harness_baseline.py freeze \
      --result eval/results/provider_harness_latest.json \
      --output eval/baselines/provider-harness-baseline-v1.json

    python eval/provider_harness_baseline.py check \
      --current eval/results/provider_harness_latest.json \
      --baseline eval/baselines/provider-harness-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    max_baseline_keyword_hit_drop: float = 0.05
    max_provider_keyword_hit_drop: float = 0.10
    max_regression_delta: float = 0.20


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _reports_by_name(payload: dict, source: Path) -> dict[str, dict]:
    reports = payload.get("reports")
    if not isinstance(reports, list):
        raise ValueError(f"{source} 缺少 reports 数组")

    indexed: dict[str, dict] = {}
    for item in reports:
        if not isinstance(item, dict):
            continue
        name = str(item.get("provider_name", "")).strip()
        if not name:
            continue
        if "keyword_hit_rate" not in item:
            raise ValueError(f"{source} provider={name} 缺少 keyword_hit_rate")
        indexed[name] = item

    if not indexed:
        raise ValueError(f"{source} reports 为空")
    return indexed


def _validate_payload(payload: dict, source: Path) -> tuple[str, dict[str, dict]]:
    baseline_provider = str(payload.get("baseline_provider", "")).strip()
    if not baseline_provider:
        raise ValueError(f"{source} 缺少 baseline_provider")

    reports = _reports_by_name(payload, source)
    if baseline_provider not in reports:
        raise ValueError(
            f"{source} baseline_provider 不在 reports 中: {baseline_provider}"
        )
    return baseline_provider, reports


def freeze_baseline(
    result_path: Path,
    output_path: Path,
    guardrails: Guardrails,
    notes: str | None = None,
) -> dict:
    result = _load_json(result_path)
    baseline_provider, reports = _validate_payload(result, result_path)

    payload = {
        "baseline_version": "1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_result": str(result_path),
        "notes": notes,
        "baseline_provider": baseline_provider,
        "reports": list(reports.values()),
        "guardrails": {
            "max_baseline_keyword_hit_drop": guardrails.max_baseline_keyword_hit_drop,
            "max_provider_keyword_hit_drop": guardrails.max_provider_keyword_hit_drop,
            "max_regression_delta": guardrails.max_regression_delta,
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
    curr_base_provider, curr_reports = _validate_payload(current, current_path)
    base_base_provider, base_reports = _validate_payload(baseline, baseline_path)

    if curr_base_provider != base_base_provider:
        return False, [
            f"baseline_provider changed: current={curr_base_provider}, baseline={base_base_provider}"
        ]

    g = guardrails_override or Guardrails(
        max_baseline_keyword_hit_drop=baseline.get("guardrails", {}).get(
            "max_baseline_keyword_hit_drop", 0.05
        ),
        max_provider_keyword_hit_drop=baseline.get("guardrails", {}).get(
            "max_provider_keyword_hit_drop", 0.10
        ),
        max_regression_delta=baseline.get("guardrails", {}).get(
            "max_regression_delta", 0.20
        ),
    )

    violations: list[str] = []

    base_provider_name = base_base_provider
    curr_base_report = curr_reports[base_provider_name]
    hist_base_report = base_reports[base_provider_name]

    base_drop = (
        hist_base_report["keyword_hit_rate"] - curr_base_report["keyword_hit_rate"]
    )
    if base_drop > g.max_baseline_keyword_hit_drop:
        violations.append(
            "baseline provider keyword_hit_rate dropped too much: "
            f"{base_drop:.2%} > {g.max_baseline_keyword_hit_drop:.2%}"
        )

    for provider_name, hist_report in base_reports.items():
        if provider_name not in curr_reports:
            violations.append(f"provider missing in current report: {provider_name}")
            continue

        curr_report = curr_reports[provider_name]
        provider_drop = (
            hist_report["keyword_hit_rate"] - curr_report["keyword_hit_rate"]
        )
        if provider_drop > g.max_provider_keyword_hit_drop:
            violations.append(
                f"{provider_name} keyword_hit_rate dropped too much: "
                f"{provider_drop:.2%} > {g.max_provider_keyword_hit_drop:.2%}"
            )

        curr_regression_delta = (
            curr_base_report["keyword_hit_rate"] - curr_report["keyword_hit_rate"]
        )
        if (
            provider_name != base_provider_name
            and curr_regression_delta > g.max_regression_delta
        ):
            violations.append(
                f"{provider_name} regression delta too large: "
                f"{curr_regression_delta:.2%} > {g.max_regression_delta:.2%}"
            )

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D1 provider harness 基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结当前 provider harness 结果")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--max-baseline-keyword-hit-drop",
        type=float,
        default=0.05,
        help="baseline provider keyword_hit_rate 最大允许下降值（默认 0.05）",
    )
    freeze_parser.add_argument(
        "--max-provider-keyword-hit-drop",
        type=float,
        default=0.10,
        help="任一 provider keyword_hit_rate 最大允许下降值（默认 0.10）",
    )
    freeze_parser.add_argument(
        "--max-regression-delta",
        type=float,
        default=0.20,
        help="相对 baseline provider 的最大允许退化差值（默认 0.20）",
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
                max_baseline_keyword_hit_drop=args.max_baseline_keyword_hit_drop,
                max_provider_keyword_hit_drop=args.max_provider_keyword_hit_drop,
                max_regression_delta=args.max_regression_delta,
            ),
            notes=args.notes,
        )
        print(f"provider harness 基线已生成: {args.output}")
        print(
            "指标快照: "
            f"baseline_provider={payload['baseline_provider']}, "
            f"providers={len(payload['reports'])}"
        )
        return 0

    if args.command == "check":
        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if passed:
            print("provider harness 基线校验通过：未发现超阈值退化。")
            return 0

        print("provider harness 基线校验失败：")
        for item in violations:
            print(f"- {item}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
