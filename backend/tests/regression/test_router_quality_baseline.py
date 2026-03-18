import json

import pytest

from eval.router_quality_baseline import (
    Guardrails,
    check_regression,
    freeze_baseline,
)


def _result_payload(
    *,
    quality_delta: float,
    latency_reduction_rate: float,
    cost_reduction_rate: float,
    fallback_rate: float,
    non_degradable_misroute_rate: float,
    gate_passed: bool,
) -> dict:
    return {
        "metrics": {
            "quality_delta": quality_delta,
            "latency_reduction_rate": latency_reduction_rate,
            "cost_reduction_rate": cost_reduction_rate,
            "fallback_rate": fallback_rate,
            "non_degradable_misroute_rate": non_degradable_misroute_rate,
            "gate_passed": gate_passed,
        }
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        quality_delta=-0.005,
        latency_reduction_rate=0.20,
        cost_reduction_rate=0.35,
        fallback_rate=0.10,
        non_degradable_misroute_rate=0.0,
        gate_passed=True,
    )
    current = _result_payload(
        quality_delta=-0.010,
        latency_reduction_rate=0.18,
        cost_reduction_rate=0.31,
        fallback_rate=0.12,
        non_degradable_misroute_rate=0.0,
        gate_passed=True,
    )

    result_path = tmp_path / "router_result.json"
    baseline_path = tmp_path / "router_baseline.json"
    current_path = tmp_path / "router_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_quality_delta_drop=0.02,
            max_latency_reduction_drop=0.05,
            max_cost_reduction_drop=0.05,
            max_fallback_rate_increase=0.10,
            max_non_degradable_misroute_rate=0.0,
        ),
        notes="router baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_quality_and_gate(tmp_path):
    baseline = _result_payload(
        quality_delta=-0.005,
        latency_reduction_rate=0.20,
        cost_reduction_rate=0.35,
        fallback_rate=0.10,
        non_degradable_misroute_rate=0.0,
        gate_passed=True,
    )
    current = _result_payload(
        quality_delta=-0.050,
        latency_reduction_rate=0.10,
        cost_reduction_rate=0.20,
        fallback_rate=0.40,
        non_degradable_misroute_rate=0.10,
        gate_passed=False,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_quality_delta_drop": 0.02,
                    "max_latency_reduction_drop": 0.05,
                    "max_cost_reduction_drop": 0.05,
                    "max_fallback_rate_increase": 0.10,
                    "max_non_degradable_misroute_rate": 0.0,
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
    assert any("quality_delta" in item for item in violations)
    assert any("gate_passed=false" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps({"metrics": {"quality_delta": 0.0}}))
    current_path.write_text(json.dumps({"metrics": {"quality_delta": 0.0}}))

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
