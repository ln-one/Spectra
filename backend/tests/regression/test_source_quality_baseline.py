import json

import pytest

from eval.source_quality_baseline import Guardrails, check_regression, freeze_baseline


def _result_payload(*, coverage: float, readability: float, relevance: float) -> dict:
    return {
        "metrics": {
            "coverage_rate": coverage,
            "readability_rate": readability,
            "relevance_rate": relevance,
        }
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(coverage=1.0, readability=1.0, relevance=1.0)
    current = _result_payload(coverage=0.98, readability=0.98, relevance=0.98)

    result_path = tmp_path / "source_result.json"
    baseline_path = tmp_path / "source_baseline.json"
    current_path = tmp_path / "source_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_coverage_drop=0.03,
            max_readability_drop=0.03,
            max_relevance_drop=0.03,
        ),
        notes="source baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_relevance(tmp_path):
    baseline = _result_payload(coverage=1.0, readability=1.0, relevance=1.0)
    current = _result_payload(coverage=0.99, readability=0.99, relevance=0.80)

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_coverage_drop": 0.03,
                    "max_readability_drop": 0.03,
                    "max_relevance_drop": 0.03,
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
    assert any("relevance_rate" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps({"metrics": {"coverage_rate": 1.0}}))
    current_path.write_text(json.dumps({"metrics": {"coverage_rate": 1.0}}))

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
