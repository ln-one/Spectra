"""
Project Space quality baseline manager (D-PS5).

Usage:
    python eval/project_space_quality_baseline.py freeze \
      --result eval/results/project_space_quality_latest.json \
      --output eval/baselines/project-space-quality-baseline-v1.json

    python eval/project_space_quality_baseline.py check \
      --current eval/results/project_space_quality_latest.json \
      --baseline eval/baselines/project-space-quality-baseline-v1.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Guardrails:
    max_anchor_drop: float = 0.02
    max_candidate_payload_drop: float = 0.02
    max_loop_drop: float = 0.03
    max_citation_drop: float = 0.02
    max_coverage_drop: float = 0.0
    max_mapping_drop: float = 0.02
    max_wave1_entry_drop: float = 0.02


REQUIRED_METRICS = {
    "artifact_anchor_completeness_rate",
    "candidate_payload_completeness_rate",
    "capability_loop_pass_rate",
    "citation_contract_pass_rate",
    "capability_coverage_rate",
    "capability_artifact_mapping_pass_rate",
    "wave1_entry_semantics_pass_rate",
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
            "max_anchor_drop": guardrails.max_anchor_drop,
            "max_candidate_payload_drop": guardrails.max_candidate_payload_drop,
            "max_loop_drop": guardrails.max_loop_drop,
            "max_citation_drop": guardrails.max_citation_drop,
            "max_coverage_drop": guardrails.max_coverage_drop,
            "max_mapping_drop": guardrails.max_mapping_drop,
            "max_wave1_entry_drop": guardrails.max_wave1_entry_drop,
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
        max_anchor_drop=baseline.get("guardrails", {}).get("max_anchor_drop", 0.02),
        max_candidate_payload_drop=baseline.get("guardrails", {}).get(
            "max_candidate_payload_drop", 0.02
        ),
        max_loop_drop=baseline.get("guardrails", {}).get("max_loop_drop", 0.03),
        max_citation_drop=baseline.get("guardrails", {}).get("max_citation_drop", 0.02),
        max_coverage_drop=baseline.get("guardrails", {}).get("max_coverage_drop", 0.0),
        max_mapping_drop=baseline.get("guardrails", {}).get("max_mapping_drop", 0.02),
        max_wave1_entry_drop=baseline.get("guardrails", {}).get(
            "max_wave1_entry_drop", 0.02
        ),
    )

    curr_m = current["metrics"]
    base_m = baseline["metrics"]
    violations: list[str] = []

    anchor_min = base_m["artifact_anchor_completeness_rate"] - g.max_anchor_drop
    if curr_m["artifact_anchor_completeness_rate"] < anchor_min:
        violations.append(
            "artifact_anchor_completeness_rate "
            f"{curr_m['artifact_anchor_completeness_rate']:.2%} < 最低允许 {anchor_min:.2%}"
        )

    candidate_min = (
        base_m["candidate_payload_completeness_rate"] - g.max_candidate_payload_drop
    )
    if curr_m["candidate_payload_completeness_rate"] < candidate_min:
        violations.append(
            "candidate_payload_completeness_rate "
            f"{curr_m['candidate_payload_completeness_rate']:.2%} < "
            f"最低允许 {candidate_min:.2%}"
        )

    loop_min = base_m["capability_loop_pass_rate"] - g.max_loop_drop
    if curr_m["capability_loop_pass_rate"] < loop_min:
        violations.append(
            "capability_loop_pass_rate "
            f"{curr_m['capability_loop_pass_rate']:.2%} < 最低允许 {loop_min:.2%}"
        )

    citation_min = base_m["citation_contract_pass_rate"] - g.max_citation_drop
    if curr_m["citation_contract_pass_rate"] < citation_min:
        violations.append(
            "citation_contract_pass_rate "
            f"{curr_m['citation_contract_pass_rate']:.2%} < 最低允许 {citation_min:.2%}"
        )

    coverage_min = base_m["capability_coverage_rate"] - g.max_coverage_drop
    if curr_m["capability_coverage_rate"] < coverage_min:
        violations.append(
            "capability_coverage_rate "
            f"{curr_m['capability_coverage_rate']:.2%} < 最低允许 {coverage_min:.2%}"
        )

    mapping_min = base_m["capability_artifact_mapping_pass_rate"] - g.max_mapping_drop
    if curr_m["capability_artifact_mapping_pass_rate"] < mapping_min:
        violations.append(
            "capability_artifact_mapping_pass_rate "
            f"{curr_m['capability_artifact_mapping_pass_rate']:.2%} < "
            f"最低允许 {mapping_min:.2%}"
        )

    wave1_entry_min = (
        base_m["wave1_entry_semantics_pass_rate"] - g.max_wave1_entry_drop
    )
    if curr_m["wave1_entry_semantics_pass_rate"] < wave1_entry_min:
        violations.append(
            "wave1_entry_semantics_pass_rate "
            f"{curr_m['wave1_entry_semantics_pass_rate']:.2%} < "
            f"最低允许 {wave1_entry_min:.2%}"
        )

    if not bool(curr_m["gate_passed"]):
        violations.append("gate_passed=false")

    return len(violations) == 0, violations


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D-PS5 Project Space 基线管理工具")
    sub = parser.add_subparsers(dest="command", required=True)

    freeze_parser = sub.add_parser("freeze", help="冻结当前 Project Space 评测结果")
    freeze_parser.add_argument("--result", required=True, help="评测结果 JSON 路径")
    freeze_parser.add_argument("--output", required=True, help="基线 JSON 输出路径")
    freeze_parser.add_argument("--notes", default=None, help="基线备注（可选）")
    freeze_parser.add_argument(
        "--max-anchor-drop",
        type=float,
        default=0.02,
        help="artifact_anchor_completeness_rate 最大允许下降值（默认 0.02）",
    )
    freeze_parser.add_argument(
        "--max-candidate-payload-drop",
        type=float,
        default=0.02,
        help="candidate_payload_completeness_rate 最大允许下降值（默认 0.02）",
    )
    freeze_parser.add_argument(
        "--max-loop-drop",
        type=float,
        default=0.03,
        help="capability_loop_pass_rate 最大允许下降值（默认 0.03）",
    )
    freeze_parser.add_argument(
        "--max-citation-drop",
        type=float,
        default=0.02,
        help="citation_contract_pass_rate 最大允许下降值（默认 0.02）",
    )
    freeze_parser.add_argument(
        "--max-coverage-drop",
        type=float,
        default=0.0,
        help="capability_coverage_rate 最大允许下降值（默认 0.0）",
    )
    freeze_parser.add_argument(
        "--max-mapping-drop",
        type=float,
        default=0.02,
        help="capability_artifact_mapping_pass_rate 最大允许下降值（默认 0.02）",
    )
    freeze_parser.add_argument(
        "--max-wave1-entry-drop",
        type=float,
        default=0.02,
        help="wave1_entry_semantics_pass_rate 最大允许下降值（默认 0.02）",
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
                max_anchor_drop=args.max_anchor_drop,
                max_candidate_payload_drop=args.max_candidate_payload_drop,
                max_loop_drop=args.max_loop_drop,
                max_citation_drop=args.max_citation_drop,
                max_coverage_drop=args.max_coverage_drop,
                max_mapping_drop=args.max_mapping_drop,
                max_wave1_entry_drop=args.max_wave1_entry_drop,
            ),
            notes=args.notes,
        )
        print(f"Project Space 基线已生成: {args.output}")
        print(
            "指标快照: "
            f"anchor={payload['metrics']['artifact_anchor_completeness_rate']:.2%}, "
            "candidate="
            f"{payload['metrics']['candidate_payload_completeness_rate']:.2%}, "
        )
        print(
            "mapping="
            f"{payload['metrics']['capability_artifact_mapping_pass_rate']:.2%}, "
            f"wave1_entry={payload['metrics']['wave1_entry_semantics_pass_rate']:.2%}"
        )
        return 0

    if args.command == "check":
        passed, violations = check_regression(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if passed:
            print("Project Space 基线校验通过：未发现超阈值退化。")
            return 0

        print("Project Space 基线校验失败：")
        for violation in violations:
            print(f"- {violation}")
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
