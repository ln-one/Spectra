import json

import pytest

from eval.network_resource_baseline import (
    Guardrails,
    check_regression,
    freeze_baseline,
)


def _result_payload(
    *,
    normalization_rate: float,
    relevance_pass_rate: float,
    low_quality_reject_rate: float,
    citation_ready_rate: float,
    gate_passed: bool,
) -> dict:
    return {
        "metrics": {
            "normalization_rate": normalization_rate,
            "relevance_pass_rate": relevance_pass_rate,
            "low_quality_reject_rate": low_quality_reject_rate,
            "citation_ready_rate": citation_ready_rate,
            "gate_passed": gate_passed,
        }
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        normalization_rate=1.0,
        relevance_pass_rate=1.0,
        low_quality_reject_rate=1.0,
        citation_ready_rate=1.0,
        gate_passed=True,
    )
    current = _result_payload(
        normalization_rate=0.98,
        relevance_pass_rate=0.98,
        low_quality_reject_rate=0.98,
        citation_ready_rate=0.98,
        gate_passed=True,
    )

    result_path = tmp_path / "network_result.json"
    baseline_path = tmp_path / "network_baseline.json"
    current_path = tmp_path / "network_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_normalization_drop=0.03,
            max_relevance_drop=0.03,
            max_reject_drop=0.03,
            max_citation_ready_drop=0.03,
        ),
        notes="network baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_metrics_and_gate(tmp_path):
    baseline = _result_payload(
        normalization_rate=1.0,
        relevance_pass_rate=1.0,
        low_quality_reject_rate=1.0,
        citation_ready_rate=1.0,
        gate_passed=True,
    )
    current = _result_payload(
        normalization_rate=0.80,
        relevance_pass_rate=0.79,
        low_quality_reject_rate=0.70,
        citation_ready_rate=0.85,
        gate_passed=False,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_normalization_drop": 0.03,
                    "max_relevance_drop": 0.03,
                    "max_reject_drop": 0.03,
                    "max_citation_ready_drop": 0.03,
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
    assert any("normalization_rate" in item for item in violations)
    assert any("gate_passed=false" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps({"metrics": {"normalization_rate": 1.0}}))
    current_path.write_text(json.dumps({"metrics": {"normalization_rate": 1.0}}))

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
