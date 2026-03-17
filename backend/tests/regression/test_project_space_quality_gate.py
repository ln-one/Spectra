import json

import pytest

from eval.project_space_quality_gate import compute_metrics, run_audit


def test_compute_metrics_all_pass():
    samples = [
        {
            "id": "s1",
            "capability": "ppt",
            "artifact_type": "pptx",
            "artifact_id": "a1",
            "based_on_version_id": "v1",
            "candidate_change_payload": {
                "artifact_id": "a1",
                "based_on_version_id": "v1",
                "change_type": "update",
                "patch": {"x": 1},
            },
            "display_ready": True,
            "export_ready": True,
            "history_ready": True,
            "candidate_change_ready": True,
            "citation_contract_ok": True,
        },
        {
            "id": "s2",
            "capability": "word",
            "artifact_type": "docx",
            "artifact_id": "a2",
            "based_on_version_id": "v2",
            "candidate_change_payload": {
                "artifact_id": "a2",
                "based_on_version_id": "v2",
                "change_type": "update",
                "patch": {"x": 2},
            },
            "display_ready": True,
            "export_ready": True,
            "history_ready": True,
            "candidate_change_ready": True,
            "citation_contract_ok": True,
        },
    ]

    m = compute_metrics(
        samples,
        min_capability_coverage_rate=0.25,
        min_capability_artifact_mapping_pass_rate=1.0,
    )
    assert m.artifact_anchor_completeness_rate == pytest.approx(1.0)
    assert m.candidate_payload_completeness_rate == pytest.approx(1.0)
    assert m.capability_loop_pass_rate == pytest.approx(1.0)
    assert m.citation_contract_pass_rate == pytest.approx(1.0)
    assert m.capability_coverage_rate == pytest.approx(0.25)
    assert m.capability_artifact_mapping_pass_rate == pytest.approx(1.0)
    assert m.gate_passed is True


def test_compute_metrics_detects_failures():
    samples = [
        {
            "id": "bad-anchor",
            "capability": "ppt",
            "artifact_type": "pptx",
            "artifact_id": "",
            "based_on_version_id": "v1",
            "candidate_change_payload": {
                "artifact_id": "a1",
                "based_on_version_id": "v1",
                "change_type": "update",
                "patch": {"x": 1},
            },
            "display_ready": True,
            "export_ready": True,
            "history_ready": True,
            "candidate_change_ready": True,
            "citation_contract_ok": True,
        },
        {
            "id": "bad-candidate",
            "capability": "word",
            "artifact_type": "pptx",
            "artifact_id": "a2",
            "based_on_version_id": "v2",
            "candidate_change_payload": {
                "artifact_id": "a2",
                "based_on_version_id": "v2",
                "change_type": "update",
                "patch": {},
            },
            "display_ready": True,
            "export_ready": True,
            "history_ready": False,
            "candidate_change_ready": True,
            "citation_contract_ok": False,
        },
    ]

    m = compute_metrics(
        samples,
        min_anchor_completeness_rate=1.0,
        min_candidate_payload_completeness_rate=1.0,
        min_capability_loop_pass_rate=1.0,
        min_citation_contract_pass_rate=1.0,
        min_capability_coverage_rate=0.25,
        min_capability_artifact_mapping_pass_rate=1.0,
    )
    assert m.gate_passed is False
    assert m.artifact_anchor_completeness_rate == pytest.approx(0.5)
    assert m.candidate_payload_completeness_rate == pytest.approx(0.5)
    assert m.capability_loop_pass_rate == pytest.approx(0.5)
    assert m.citation_contract_pass_rate == pytest.approx(0.5)
    assert m.capability_artifact_mapping_pass_rate == pytest.approx(0.5)
    assert "bad-anchor" in m.failed_anchor_ids
    assert "bad-candidate" in m.failed_candidate_payload_ids
    assert "bad-candidate" in m.failed_loop_ids
    assert "bad-candidate" in m.failed_citation_ids
    assert "bad-candidate" in m.failed_mapping_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "thresholds": {
            "min_anchor_completeness_rate": 0.0,
            "min_candidate_payload_completeness_rate": 0.0,
            "min_capability_loop_pass_rate": 0.0,
            "min_citation_contract_pass_rate": 0.0,
            "min_capability_coverage_rate": 0.0,
        },
        "samples": [
            {
                "id": "ok",
                "capability": "ppt",
                "artifact_type": "pptx",
                "artifact_id": "a1",
                "based_on_version_id": "v1",
                "candidate_change_payload": {
                    "artifact_id": "a1",
                    "based_on_version_id": "v1",
                    "change_type": "update",
                    "patch": {"x": 1},
                },
                "display_ready": True,
                "export_ready": True,
                "history_ready": True,
                "candidate_change_ready": True,
                "citation_contract_ok": True,
            }
        ],
    }
    dataset_path = tmp_path / "project_space_quality.json"
    output_path = tmp_path / "result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.gate_passed is True
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["gate_passed"] is True


def test_compute_metrics_checks_metadata_kind_for_outline():
    samples = [
        {
            "id": "outline-bad-kind",
            "capability": "outline",
            "artifact_type": "summary",
            "metadata": {"kind": "summary"},
            "artifact_id": "a1",
            "based_on_version_id": "v1",
            "candidate_change_payload": {
                "artifact_id": "a1",
                "based_on_version_id": "v1",
                "change_type": "update",
                "patch": {"x": 1},
            },
            "display_ready": True,
            "export_ready": True,
            "history_ready": True,
            "candidate_change_ready": True,
            "citation_contract_ok": True,
        }
    ]

    m = compute_metrics(
        samples,
        min_anchor_completeness_rate=0.0,
        min_candidate_payload_completeness_rate=0.0,
        min_capability_loop_pass_rate=0.0,
        min_citation_contract_pass_rate=0.0,
        min_capability_coverage_rate=0.0,
        min_capability_artifact_mapping_pass_rate=1.0,
    )

    assert m.gate_passed is False
    assert m.capability_artifact_mapping_pass_rate == pytest.approx(0.0)
    assert "outline-bad-kind" in m.failed_mapping_ids
