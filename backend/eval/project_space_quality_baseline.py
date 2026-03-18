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


@dataclass
class RegressionCheckReport:
    passed: bool
    violations: list[str]
    grouped_violations: dict[str, list[str]]
    triggered_guardrails: dict[str, list[str]]
    current_dataset: str | None
    baseline_dataset: str | None
    current_total_samples: int | None
    baseline_total_samples: int | None

    @property
    def violation_count(self) -> int:
        return len(self.violations)

    @property
    def group_count(self) -> int:
        return sum(1 for items in self.grouped_violations.values() if items)

    @property
    def triggered_guardrail_keys(self) -> list[str]:
        return [
            key for key, items in self.triggered_guardrails.items() if items
        ]


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
        "dataset": result.get("dataset"),
        "total_samples": result.get("total_samples"),
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


def _append_violation(
    grouped_violations: dict[str, list[str]],
    triggered_guardrails: dict[str, list[str]],
    group: str,
    guardrail: str | None,
    message: str,
    violations: list[str],
) -> None:
    grouped_violations[group].append(message)
    if guardrail:
        triggered_guardrails[guardrail].append(message)
    violations.append(message)


def check_regression_report(
    current_path: Path,
    baseline_path: Path,
    guardrails_override: Guardrails | None = None,
) -> RegressionCheckReport:
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
    grouped_violations: dict[str, list[str]] = {
        "anchor": [],
        "candidate_payload": [],
        "capability_loop": [],
        "citation": [],
        "coverage": [],
        "mapping": [],
        "entry_semantics": [],
        "gate": [],
    }
    triggered_guardrails: dict[str, list[str]] = {
        "max_anchor_drop": [],
        "max_candidate_payload_drop": [],
        "max_loop_drop": [],
        "max_citation_drop": [],
        "max_coverage_drop": [],
        "max_mapping_drop": [],
        "max_wave1_entry_drop": [],
    }

    anchor_min = base_m["artifact_anchor_completeness_rate"] - g.max_anchor_drop
    if curr_m["artifact_anchor_completeness_rate"] < anchor_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "anchor",
            "max_anchor_drop",
            "artifact_anchor_completeness_rate "
            f"{curr_m['artifact_anchor_completeness_rate']:.2%} < 最低允许 {anchor_min:.2%} "
            f"(guardrail=max_anchor_drop, baseline={base_m['artifact_anchor_completeness_rate']:.2%}, "
            f"allowed_drop={g.max_anchor_drop:.2%})",
            violations,
        )

    candidate_min = (
        base_m["candidate_payload_completeness_rate"] - g.max_candidate_payload_drop
    )
    if curr_m["candidate_payload_completeness_rate"] < candidate_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "candidate_payload",
            "max_candidate_payload_drop",
            "candidate_payload_completeness_rate "
            f"{curr_m['candidate_payload_completeness_rate']:.2%} < "
            f"最低允许 {candidate_min:.2%} "
            f"(guardrail=max_candidate_payload_drop, "
            f"baseline={base_m['candidate_payload_completeness_rate']:.2%}, "
            f"allowed_drop={g.max_candidate_payload_drop:.2%})",
            violations,
        )

    loop_min = base_m["capability_loop_pass_rate"] - g.max_loop_drop
    if curr_m["capability_loop_pass_rate"] < loop_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "capability_loop",
            "max_loop_drop",
            "capability_loop_pass_rate "
            f"{curr_m['capability_loop_pass_rate']:.2%} < 最低允许 {loop_min:.2%} "
            f"(guardrail=max_loop_drop, baseline={base_m['capability_loop_pass_rate']:.2%}, "
            f"allowed_drop={g.max_loop_drop:.2%})",
            violations,
        )

    citation_min = base_m["citation_contract_pass_rate"] - g.max_citation_drop
    if curr_m["citation_contract_pass_rate"] < citation_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "citation",
            "max_citation_drop",
            "citation_contract_pass_rate "
            f"{curr_m['citation_contract_pass_rate']:.2%} < 最低允许 {citation_min:.2%} "
            f"(guardrail=max_citation_drop, baseline={base_m['citation_contract_pass_rate']:.2%}, "
            f"allowed_drop={g.max_citation_drop:.2%})",
            violations,
        )

    coverage_min = base_m["capability_coverage_rate"] - g.max_coverage_drop
    if curr_m["capability_coverage_rate"] < coverage_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "coverage",
            "max_coverage_drop",
            "capability_coverage_rate "
            f"{curr_m['capability_coverage_rate']:.2%} < 最低允许 {coverage_min:.2%} "
            f"(guardrail=max_coverage_drop, baseline={base_m['capability_coverage_rate']:.2%}, "
            f"allowed_drop={g.max_coverage_drop:.2%})",
            violations,
        )

    mapping_min = base_m["capability_artifact_mapping_pass_rate"] - g.max_mapping_drop
    if curr_m["capability_artifact_mapping_pass_rate"] < mapping_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "mapping",
            "max_mapping_drop",
            "capability_artifact_mapping_pass_rate "
            f"{curr_m['capability_artifact_mapping_pass_rate']:.2%} < "
            f"最低允许 {mapping_min:.2%} "
            f"(guardrail=max_mapping_drop, "
            f"baseline={base_m['capability_artifact_mapping_pass_rate']:.2%}, "
            f"allowed_drop={g.max_mapping_drop:.2%})",
            violations,
        )

    wave1_entry_min = base_m["wave1_entry_semantics_pass_rate"] - g.max_wave1_entry_drop
    if curr_m["wave1_entry_semantics_pass_rate"] < wave1_entry_min:
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "entry_semantics",
            "max_wave1_entry_drop",
            "wave1_entry_semantics_pass_rate "
            f"{curr_m['wave1_entry_semantics_pass_rate']:.2%} < "
            f"最低允许 {wave1_entry_min:.2%} "
            f"(guardrail=max_wave1_entry_drop, "
            f"baseline={base_m['wave1_entry_semantics_pass_rate']:.2%}, "
            f"allowed_drop={g.max_wave1_entry_drop:.2%})",
            violations,
        )

    if not bool(curr_m["gate_passed"]):
        _append_violation(
            grouped_violations,
            triggered_guardrails,
            "gate",
            None,
            "gate_passed=false",
            violations,
        )

    return RegressionCheckReport(
        passed=len(violations) == 0,
        violations=violations,
        grouped_violations=grouped_violations,
        triggered_guardrails=triggered_guardrails,
        current_dataset=current.get("dataset"),
        baseline_dataset=baseline.get("dataset"),
        current_total_samples=current.get("total_samples"),
        baseline_total_samples=baseline.get("total_samples"),
    )


def check_regression(
    current_path: Path,
    baseline_path: Path,
    guardrails_override: Guardrails | None = None,
) -> tuple[bool, list[str]]:
    report = check_regression_report(
        current_path=current_path,
        baseline_path=baseline_path,
        guardrails_override=guardrails_override,
    )
    return report.passed, report.violations


def format_failure_report(report: RegressionCheckReport) -> list[str]:
    triggered_guardrails = ", ".join(report.triggered_guardrail_keys) or "-"
    lines = [
        "Project Space 基线校验失败摘要：",
        f"- 失败分组数: {report.group_count}",
        f"- 失败项数: {report.violation_count}",
        f"- 触发 guardrails: {triggered_guardrails}",
        "- 数据集: "
        f"current={report.current_dataset or '-'}, "
        f"baseline={report.baseline_dataset or '-'}",
        "- 样本数: "
        f"current={report.current_total_samples or '-'}, "
        f"baseline={report.baseline_total_samples or '-'}",
        "Project Space 基线校验触发的 guardrails：",
    ]
    for key in report.triggered_guardrail_keys:
        lines.append(f"- {key}")
    lines.extend(
        [
        "Project Space 基线校验失败分组：",
        ]
    )
    group_titles = {
        "anchor": "成果锚点",
        "candidate_payload": "Candidate Change Payload",
        "capability_loop": "能力闭环",
        "citation": "引用契约",
        "coverage": "能力覆盖率",
        "mapping": "Artifact 映射",
        "entry_semantics": "入口语义",
        "gate": "总门禁",
    }
    for key, title in group_titles.items():
        items = report.grouped_violations[key]
        if not items:
            continue
        lines.append(f"[{title}]")
        for item in items:
            lines.append(f"- {item}")
    return lines


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
        report = check_regression_report(
            current_path=Path(args.current),
            baseline_path=Path(args.baseline),
        )
        if report.passed:
            print("Project Space 基线校验通过：未发现超阈值退化。")
            return 0

        for line in format_failure_report(report):
            print(line)
        return 1

    parser.error("未知命令")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
