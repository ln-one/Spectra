"""
D-PS5 Project Space 质量门禁评测工具。

核心指标：
1) artifact_anchor_completeness_rate
2) candidate_change_payload_completeness_rate
3) capability_loop_pass_rate
4) citation_contract_pass_rate
5) capability_coverage_rate
6) capability_artifact_mapping_pass_rate
7) wave1_entry_semantics_pass_rate
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

ALL_CAPABILITIES = {
    "ppt",
    "word",
    "mindmap",
    "outline",
    "quiz",
    "summary",
    "animation",
    "handout",
}

CAPABILITY_ARTIFACT_MAPPING = {
    "ppt": {"artifact_type": "pptx", "metadata_capability": "ppt"},
    "word": {"artifact_type": "docx", "metadata_capability": "word"},
    "mindmap": {"artifact_type": "mindmap", "metadata_capability": "mindmap"},
    "outline": {
        "artifact_type": "summary",
        "metadata_kind": "outline",
        "metadata_capability": "outline",
    },
    "quiz": {"artifact_type": "exercise", "metadata_capability": "quiz"},
    "summary": {"artifact_type": "summary", "metadata_capability": "summary"},
    "animation": {
        "artifact_type": "html",
        "metadata_kind": "animation_storyboard",
        "metadata_capability": "animation",
    },
    "handout": {
        "artifact_type": "docx",
        "metadata_kind": "handout",
        "metadata_capability": "handout",
    },
}

WAVE1_ENTRY_ROUTE_MAPPING = {
    "ppt": {"entry_route": "session-first", "session_required": True},
    "word": {"entry_route": "session-first", "session_required": True},
    "mindmap": {"entry_route": "artifact-lite", "session_required": False},
    "outline": {"entry_route": "session-first", "session_required": True},
    "quiz": {"entry_route": "artifact-lite", "session_required": False},
    "summary": {"entry_route": "artifact-lite", "session_required": False},
}


@dataclass
class ProjectSpaceQualityMetrics:
    total_samples: int
    artifact_anchor_completeness_rate: float
    candidate_payload_completeness_rate: float
    capability_loop_pass_rate: float
    citation_contract_pass_rate: float
    capability_coverage_rate: float
    capability_artifact_mapping_pass_rate: float
    wave1_entry_semantics_pass_rate: float
    gate_passed: bool
    failed_anchor_ids: list[str]
    failed_candidate_payload_ids: list[str]
    failed_loop_ids: list[str]
    failed_citation_ids: list[str]
    failed_mapping_ids: list[str]
    failed_wave1_entry_ids: list[str]

    def summary(self) -> str:
        failed = (
            len(self.failed_anchor_ids)
            + len(self.failed_candidate_payload_ids)
            + len(self.failed_loop_ids)
            + len(self.failed_citation_ids)
            + len(self.failed_mapping_ids)
            + len(self.failed_wave1_entry_ids)
        )
        return (
            f"total={self.total_samples}, "
            f"anchor={self.artifact_anchor_completeness_rate:.1%}, "
            f"candidate_payload={self.candidate_payload_completeness_rate:.1%}, "
            f"loop={self.capability_loop_pass_rate:.1%}, "
            f"citation={self.citation_contract_pass_rate:.1%}, "
            f"coverage={self.capability_coverage_rate:.1%}, "
            f"mapping={self.capability_artifact_mapping_pass_rate:.1%}, "
            f"wave1_entry={self.wave1_entry_semantics_pass_rate:.1%}, "
            f"gate_passed={self.gate_passed}, "
            f"failed={failed}"
        )


def _is_non_empty(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def _anchor_complete(sample: dict) -> bool:
    requires_anchor = bool(sample.get("requires_anchor", True))
    if not requires_anchor:
        return True
    return _is_non_empty(sample.get("artifact_id")) and _is_non_empty(
        sample.get("based_on_version_id")
    )


def _candidate_payload_complete(sample: dict) -> bool:
    requires_candidate = bool(sample.get("requires_candidate_change", True))
    if not requires_candidate:
        return True

    payload = sample.get("candidate_change_payload")
    if not isinstance(payload, dict):
        return False

    required_fields = sample.get("required_candidate_fields") or [
        "artifact_id",
        "based_on_version_id",
        "change_type",
        "patch",
    ]
    return all(_is_non_empty(payload.get(field)) for field in required_fields)


def _capability_loop_pass(sample: dict) -> bool:
    return all(
        bool(sample.get(field, False))
        for field in [
            "display_ready",
            "export_ready",
            "history_ready",
            "candidate_change_ready",
        ]
    )


def _capability_artifact_mapping_pass(sample: dict) -> bool:
    capability = str(sample.get("capability", "") or "").strip().lower()
    if not capability:
        return False

    expected = CAPABILITY_ARTIFACT_MAPPING.get(capability)
    if not expected:
        return False

    artifact_type = str(sample.get("artifact_type", "") or "").strip().lower()
    if artifact_type != expected["artifact_type"]:
        return False

    metadata = sample.get("metadata")
    expected_kind = expected.get("metadata_kind")
    expected_capability = expected.get("metadata_capability")
    if not expected_kind and not expected_capability:
        return True
    if not isinstance(metadata, dict):
        return False

    if expected_kind:
        metadata_kind = str(metadata.get("kind", "") or "").strip().lower()
        if metadata_kind != expected_kind:
            return False

    if expected_capability:
        metadata_capability = str(metadata.get("capability", "") or "").strip().lower()
        if metadata_capability != expected_capability:
            return False

    return True


def _wave1_entry_semantics_pass(sample: dict) -> bool:
    capability = str(sample.get("capability", "") or "").strip().lower()
    expected = WAVE1_ENTRY_ROUTE_MAPPING.get(capability)
    if not expected:
        return True

    entry_route = str(sample.get("entry_route", "") or "").strip().lower()
    if entry_route != expected["entry_route"]:
        return False

    session_required = bool(sample.get("session_required", False))
    return session_required == expected["session_required"]


def compute_metrics(
    samples: list[dict],
    *,
    min_anchor_completeness_rate: float = 0.95,
    min_candidate_payload_completeness_rate: float = 0.95,
    min_capability_loop_pass_rate: float = 0.90,
    min_citation_contract_pass_rate: float = 0.95,
    min_capability_coverage_rate: float = 1.0,
    min_capability_artifact_mapping_pass_rate: float = 0.95,
    min_wave1_entry_semantics_pass_rate: float = 0.95,
) -> ProjectSpaceQualityMetrics:
    if not samples:
        return ProjectSpaceQualityMetrics(
            total_samples=0,
            artifact_anchor_completeness_rate=0.0,
            candidate_payload_completeness_rate=0.0,
            capability_loop_pass_rate=0.0,
            citation_contract_pass_rate=0.0,
            capability_coverage_rate=0.0,
            capability_artifact_mapping_pass_rate=0.0,
            wave1_entry_semantics_pass_rate=0.0,
            gate_passed=False,
            failed_anchor_ids=[],
            failed_candidate_payload_ids=[],
            failed_loop_ids=[],
            failed_citation_ids=[],
            failed_mapping_ids=[],
            failed_wave1_entry_ids=[],
        )

    anchor_pass = 0
    candidate_pass = 0
    loop_pass = 0
    citation_pass = 0
    mapping_pass = 0
    wave1_entry_pass = 0

    failed_anchor_ids: list[str] = []
    failed_candidate_payload_ids: list[str] = []
    failed_loop_ids: list[str] = []
    failed_citation_ids: list[str] = []
    failed_mapping_ids: list[str] = []
    failed_wave1_entry_ids: list[str] = []

    covered_capabilities: set[str] = set()

    for idx, sample in enumerate(samples, start=1):
        sample_id = sample.get("id", f"sample-{idx}")
        capability = str(sample.get("capability", "") or "").strip().lower()
        if capability:
            covered_capabilities.add(capability)

        if _anchor_complete(sample):
            anchor_pass += 1
        else:
            failed_anchor_ids.append(sample_id)

        if _candidate_payload_complete(sample):
            candidate_pass += 1
        else:
            failed_candidate_payload_ids.append(sample_id)

        if _capability_loop_pass(sample):
            loop_pass += 1
        else:
            failed_loop_ids.append(sample_id)

        citation_ok = bool(sample.get("citation_contract_ok", True))
        if citation_ok:
            citation_pass += 1
        else:
            failed_citation_ids.append(sample_id)

        if _capability_artifact_mapping_pass(sample):
            mapping_pass += 1
        else:
            failed_mapping_ids.append(sample_id)

        if _wave1_entry_semantics_pass(sample):
            wave1_entry_pass += 1
        else:
            failed_wave1_entry_ids.append(sample_id)

    total = len(samples)
    anchor_rate = anchor_pass / total
    candidate_rate = candidate_pass / total
    loop_rate = loop_pass / total
    citation_rate = citation_pass / total
    coverage_rate = len(covered_capabilities & ALL_CAPABILITIES) / len(ALL_CAPABILITIES)
    mapping_rate = mapping_pass / total
    wave1_entry_rate = wave1_entry_pass / total

    gate_passed = (
        anchor_rate >= min_anchor_completeness_rate
        and candidate_rate >= min_candidate_payload_completeness_rate
        and loop_rate >= min_capability_loop_pass_rate
        and citation_rate >= min_citation_contract_pass_rate
        and coverage_rate >= min_capability_coverage_rate
        and mapping_rate >= min_capability_artifact_mapping_pass_rate
        and wave1_entry_rate >= min_wave1_entry_semantics_pass_rate
    )

    return ProjectSpaceQualityMetrics(
        total_samples=total,
        artifact_anchor_completeness_rate=anchor_rate,
        candidate_payload_completeness_rate=candidate_rate,
        capability_loop_pass_rate=loop_rate,
        citation_contract_pass_rate=citation_rate,
        capability_coverage_rate=coverage_rate,
        capability_artifact_mapping_pass_rate=mapping_rate,
        wave1_entry_semantics_pass_rate=wave1_entry_rate,
        gate_passed=gate_passed,
        failed_anchor_ids=failed_anchor_ids,
        failed_candidate_payload_ids=failed_candidate_payload_ids,
        failed_loop_ids=failed_loop_ids,
        failed_citation_ids=failed_citation_ids,
        failed_mapping_ids=failed_mapping_ids,
        failed_wave1_entry_ids=failed_wave1_entry_ids,
    )


def run_audit(
    dataset_path: Path,
    output_path: Path | None = None,
) -> ProjectSpaceQualityMetrics:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    thresholds = dataset.get("thresholds", {}) or {}
    samples = dataset.get("samples", [])

    metrics = compute_metrics(
        samples,
        min_anchor_completeness_rate=float(
            thresholds.get("min_anchor_completeness_rate", 0.95)
        ),
        min_candidate_payload_completeness_rate=float(
            thresholds.get("min_candidate_payload_completeness_rate", 0.95)
        ),
        min_capability_loop_pass_rate=float(
            thresholds.get("min_capability_loop_pass_rate", 0.90)
        ),
        min_citation_contract_pass_rate=float(
            thresholds.get("min_citation_contract_pass_rate", 0.95)
        ),
        min_capability_coverage_rate=float(
            thresholds.get("min_capability_coverage_rate", 1.0)
        ),
        min_capability_artifact_mapping_pass_rate=float(
            thresholds.get("min_capability_artifact_mapping_pass_rate", 0.95)
        ),
        min_wave1_entry_semantics_pass_rate=float(
            thresholds.get("min_wave1_entry_semantics_pass_rate", 0.95)
        ),
    )

    if output_path:
        payload = {
            "dataset": str(dataset_path),
            "total_samples": metrics.total_samples,
            "metrics": {
                "artifact_anchor_completeness_rate": (
                    metrics.artifact_anchor_completeness_rate
                ),
                "candidate_payload_completeness_rate": (
                    metrics.candidate_payload_completeness_rate
                ),
                "capability_loop_pass_rate": metrics.capability_loop_pass_rate,
                "citation_contract_pass_rate": metrics.citation_contract_pass_rate,
                "capability_coverage_rate": metrics.capability_coverage_rate,
                "capability_artifact_mapping_pass_rate": (
                    metrics.capability_artifact_mapping_pass_rate
                ),
                "wave1_entry_semantics_pass_rate": (
                    metrics.wave1_entry_semantics_pass_rate
                ),
                "gate_passed": metrics.gate_passed,
                "failed_anchor_ids": metrics.failed_anchor_ids,
                "failed_candidate_payload_ids": metrics.failed_candidate_payload_ids,
                "failed_loop_ids": metrics.failed_loop_ids,
                "failed_citation_ids": metrics.failed_citation_ids,
                "failed_mapping_ids": metrics.failed_mapping_ids,
                "failed_wave1_entry_ids": metrics.failed_wave1_entry_ids,
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description="D-PS5 Project Space 质量门禁评测")
    parser.add_argument(
        "--dataset",
        default="eval/project_space_quality_samples.json",
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
