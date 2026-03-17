"""
D-PS4 第一波能力入口语义审计（联调样本先行）。

覆盖能力：
- session-first: ppt / word / outline
- artifact-lite: summary
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


WAVE1_ENTRY_RULES = {
    "ppt": {"route": "session-first"},
    "word": {"route": "session-first"},
    "outline": {"route": "session-first"},
    "summary": {"route": "artifact-lite"},
}


@dataclass
class Wave1EntryAuditMetrics:
    total_samples: int
    contract_pass_rate: float
    gate_passed: bool
    failed_sample_ids: list[str]
    failed_reasons: list[str]

    def summary(self) -> str:
        return (
            f"total={self.total_samples}, "
            f"contract_pass_rate={self.contract_pass_rate:.1%}, "
            f"gate_passed={self.gate_passed}, "
            f"failed={len(self.failed_sample_ids)}"
        )


def _is_non_empty(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _is_session_first_endpoint(endpoint: str) -> bool:
    return endpoint.startswith("/api/v1/generate/sessions/")


def _is_artifact_lite_endpoint(endpoint: str) -> bool:
    return endpoint.startswith("/api/v1/projects/") and endpoint.endswith("/artifacts")


def _validate_sample(sample: dict) -> tuple[bool, str]:
    capability = str(sample.get("capability", "") or "").strip().lower()
    rule = WAVE1_ENTRY_RULES.get(capability)
    if not rule:
        return False, f"unsupported capability: {capability}"

    endpoint = str(sample.get("endpoint", "") or "").strip()
    request = sample.get("request") if isinstance(sample.get("request"), dict) else {}

    project_id = request.get("project_id")
    session_id = request.get("session_id")

    if not _is_non_empty(project_id):
        return False, "missing project_id"

    if rule["route"] == "session-first":
        if not _is_session_first_endpoint(endpoint):
            return False, "session-first capability with invalid endpoint"
        if not _is_non_empty(session_id):
            return False, "session-first capability missing session_id"
        return True, ""

    if rule["route"] == "artifact-lite":
        if not _is_artifact_lite_endpoint(endpoint):
            return False, "artifact-lite capability with invalid endpoint"
        if _is_non_empty(session_id):
            return False, "artifact-lite capability should not require session_id"
        return True, ""

    return False, "unsupported route"


def compute_metrics(
    samples: list[dict],
    *,
    min_contract_pass_rate: float = 1.0,
) -> Wave1EntryAuditMetrics:
    if not samples:
        return Wave1EntryAuditMetrics(
            total_samples=0,
            contract_pass_rate=0.0,
            gate_passed=False,
            failed_sample_ids=[],
            failed_reasons=[],
        )

    passed = 0
    failed_sample_ids: list[str] = []
    failed_reasons: list[str] = []

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        ok, reason = _validate_sample(sample)
        if ok:
            passed += 1
            continue
        failed_sample_ids.append(sample_id)
        failed_reasons.append(f"{sample_id}: {reason}")

    total = len(samples)
    pass_rate = passed / total
    gate_passed = pass_rate >= min_contract_pass_rate

    return Wave1EntryAuditMetrics(
        total_samples=total,
        contract_pass_rate=pass_rate,
        gate_passed=gate_passed,
        failed_sample_ids=failed_sample_ids,
        failed_reasons=failed_reasons,
    )


def run_audit(
    dataset_path: Path,
    output_path: Path | None = None,
) -> Wave1EntryAuditMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = dataset.get("samples", [])
    thresholds = dataset.get("thresholds", {}) or {}

    metrics = compute_metrics(
        samples,
        min_contract_pass_rate=float(thresholds.get("min_contract_pass_rate", 1.0)),
    )

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "contract_pass_rate": metrics.contract_pass_rate,
                "gate_passed": metrics.gate_passed,
                "failed_sample_ids": metrics.failed_sample_ids,
                "failed_reasons": metrics.failed_reasons,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D-PS4 第一波入口语义审计")
    parser.add_argument(
        "--dataset",
        default="eval/project_space_wave1_entry_samples.json",
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
