import json

import pytest

from eval.provider_harness_baseline import Guardrails, check_regression, freeze_baseline


def _payload(*, baseline_provider: str, reports: list[dict]) -> dict:
    return {
        "baseline_provider": baseline_provider,
        "regression_threshold": 0.2,
        "reports": reports,
        "regressions": {},
        "summary": "test",
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _payload(
        baseline_provider="mock_high",
        reports=[
            {"provider_name": "mock_high", "keyword_hit_rate": 1.0},
            {"provider_name": "mock_low", "keyword_hit_rate": 0.85},
        ],
    )
    current = _payload(
        baseline_provider="mock_high",
        reports=[
            {"provider_name": "mock_high", "keyword_hit_rate": 0.98},
            {"provider_name": "mock_low", "keyword_hit_rate": 0.80},
        ],
    )

    result_path = tmp_path / "provider_result.json"
    baseline_path = tmp_path / "provider_baseline.json"
    current_path = tmp_path / "provider_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_baseline_keyword_hit_drop=0.05,
            max_provider_keyword_hit_drop=0.10,
            max_regression_delta=0.20,
        ),
        notes="provider baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_delta(tmp_path):
    baseline = _payload(
        baseline_provider="mock_high",
        reports=[
            {"provider_name": "mock_high", "keyword_hit_rate": 1.0},
            {"provider_name": "mock_low", "keyword_hit_rate": 0.90},
        ],
    )
    current = _payload(
        baseline_provider="mock_high",
        reports=[
            {"provider_name": "mock_high", "keyword_hit_rate": 1.0},
            {"provider_name": "mock_low", "keyword_hit_rate": 0.70},
        ],
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "baseline_provider": "mock_high",
                "reports": baseline["reports"],
                "guardrails": {
                    "max_baseline_keyword_hit_drop": 0.05,
                    "max_provider_keyword_hit_drop": 0.10,
                    "max_regression_delta": 0.20,
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
    assert any("keyword_hit_rate dropped too much" in item for item in violations)


def test_check_regression_raises_for_missing_fields(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(json.dumps({"baseline_provider": "mock_high"}))
    current_path.write_text(json.dumps({"baseline_provider": "mock_high"}))

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
