import json

import pytest

from eval.project_space_quality_baseline import (
    Guardrails,
    check_regression,
    check_regression_report,
    format_failure_report,
    freeze_baseline,
    main,
)


def _result_payload(
    *,
    anchor: float,
    candidate: float,
    loop: float,
    citation: float,
    coverage: float,
    mapping: float,
    wave1_entry: float,
    gate_passed: bool,
) -> dict:
    return {
        "metrics": {
            "artifact_anchor_completeness_rate": anchor,
            "candidate_payload_completeness_rate": candidate,
            "capability_loop_pass_rate": loop,
            "citation_contract_pass_rate": citation,
            "capability_coverage_rate": coverage,
            "capability_artifact_mapping_pass_rate": mapping,
            "wave1_entry_semantics_pass_rate": wave1_entry,
            "gate_passed": gate_passed,
        }
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        anchor=1.0,
        candidate=1.0,
        loop=1.0,
        citation=1.0,
        coverage=1.0,
        mapping=1.0,
        wave1_entry=1.0,
        gate_passed=True,
    )
    current = _result_payload(
        anchor=0.99,
        candidate=0.99,
        loop=0.98,
        citation=0.99,
        coverage=1.0,
        mapping=0.99,
        wave1_entry=0.99,
        gate_passed=True,
    )

    result_path = tmp_path / "ps_result.json"
    baseline_path = tmp_path / "ps_baseline.json"
    current_path = tmp_path / "ps_current.json"
    result_path.write_text(
        json.dumps(
            {
                "dataset": "backend/eval/project_space_quality_samples.json",
                "total_samples": 8,
                "metrics": baseline_source["metrics"],
            }
        ),
        encoding="utf-8",
    )
    current_path.write_text(json.dumps(current), encoding="utf-8")

    payload = freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_anchor_drop=0.02,
            max_candidate_payload_drop=0.02,
            max_loop_drop=0.03,
            max_citation_drop=0.02,
            max_coverage_drop=0.0,
            max_mapping_drop=0.02,
            max_wave1_entry_drop=0.02,
        ),
        notes="project space baseline",
    )
    assert payload["dataset"] == "backend/eval/project_space_quality_samples.json"
    assert payload["total_samples"] == 8

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_mapping_and_gate(tmp_path):
    baseline = _result_payload(
        anchor=1.0,
        candidate=1.0,
        loop=1.0,
        citation=1.0,
        coverage=1.0,
        mapping=1.0,
        wave1_entry=1.0,
        gate_passed=True,
    )
    current = _result_payload(
        anchor=0.95,
        candidate=0.97,
        loop=0.95,
        citation=0.97,
        coverage=0.9,
        mapping=0.85,
        wave1_entry=0.85,
        gate_passed=False,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_anchor_drop": 0.02,
                    "max_candidate_payload_drop": 0.02,
                    "max_loop_drop": 0.03,
                    "max_citation_drop": 0.02,
                    "max_coverage_drop": 0.0,
                    "max_mapping_drop": 0.02,
                    "max_wave1_entry_drop": 0.02,
                },
            }
        ),
        encoding="utf-8",
    )
    current_path.write_text(json.dumps(current), encoding="utf-8")

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is False
    assert any("capability_artifact_mapping_pass_rate" in item for item in violations)
    assert any("wave1_entry_semantics_pass_rate" in item for item in violations)
    assert any("gate_passed=false" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps({"metrics": {"artifact_anchor_completeness_rate": 1.0}})
    )
    current_path.write_text(
        json.dumps({"metrics": {"artifact_anchor_completeness_rate": 1.0}})
    )

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)


def test_check_regression_report_groups_failures(tmp_path):
    baseline = {
        "dataset": "baseline-dataset.json",
        "total_samples": 8,
        "metrics": _result_payload(
            anchor=1.0,
            candidate=1.0,
            loop=1.0,
            citation=1.0,
            coverage=1.0,
            mapping=1.0,
            wave1_entry=1.0,
            gate_passed=True,
        )["metrics"],
        "guardrails": {
            "max_anchor_drop": 0.02,
            "max_candidate_payload_drop": 0.02,
            "max_loop_drop": 0.03,
            "max_citation_drop": 0.02,
            "max_coverage_drop": 0.0,
            "max_mapping_drop": 0.02,
            "max_wave1_entry_drop": 0.02,
        },
    }
    current = {
        "dataset": "current-dataset.json",
        "total_samples": 6,
        "metrics": _result_payload(
            anchor=0.95,
            candidate=0.97,
            loop=0.95,
            citation=0.97,
            coverage=0.9,
            mapping=0.85,
            wave1_entry=0.85,
            gate_passed=False,
        )["metrics"],
    }

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    report = check_regression_report(
        current_path=current_path,
        baseline_path=baseline_path,
    )

    assert report.passed is False
    assert report.current_dataset == "current-dataset.json"
    assert report.baseline_dataset == "baseline-dataset.json"
    assert report.current_total_samples == 6
    assert report.baseline_total_samples == 8
    assert "gate_passed=false" in report.grouped_violations["gate"]
    assert any(
        "capability_artifact_mapping_pass_rate" in item
        for item in report.grouped_violations["mapping"]
    )

    lines = format_failure_report(report)
    assert any("失败分组数" in line for line in lines)
    assert any("current=current-dataset.json" in line for line in lines)
    assert any("[Artifact 映射]" == line for line in lines)
    assert any("[总门禁]" == line for line in lines)


def test_cli_check_prints_summary_and_grouped_failures(tmp_path, monkeypatch, capsys):
    baseline = {
        "dataset": "baseline-dataset.json",
        "total_samples": 8,
        "metrics": _result_payload(
            anchor=1.0,
            candidate=1.0,
            loop=1.0,
            citation=1.0,
            coverage=1.0,
            mapping=1.0,
            wave1_entry=1.0,
            gate_passed=True,
        )["metrics"],
        "guardrails": {
            "max_anchor_drop": 0.02,
            "max_candidate_payload_drop": 0.02,
            "max_loop_drop": 0.03,
            "max_citation_drop": 0.02,
            "max_coverage_drop": 0.0,
            "max_mapping_drop": 0.02,
            "max_wave1_entry_drop": 0.02,
        },
    }
    current = {
        "dataset": "current-dataset.json",
        "total_samples": 6,
        "metrics": _result_payload(
            anchor=1.0,
            candidate=1.0,
            loop=1.0,
            citation=1.0,
            coverage=1.0,
            mapping=0.85,
            wave1_entry=1.0,
            gate_passed=False,
        )["metrics"],
    }

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    monkeypatch.setattr(
        "sys.argv",
        [
            "project_space_quality_baseline.py",
            "check",
            "--current",
            str(current_path),
            "--baseline",
            str(baseline_path),
        ],
    )

    assert main() == 1
    captured = capsys.readouterr()
    assert "Project Space 基线校验失败摘要：" in captured.out
    assert "[Artifact 映射]" in captured.out
    assert "[总门禁]" in captured.out
