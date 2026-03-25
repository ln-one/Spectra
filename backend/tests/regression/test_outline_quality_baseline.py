import json

import pytest

from eval.outline_quality_baseline import Guardrails, check_regression, freeze_baseline


def _result_payload(
    *,
    title: float,
    keypoint: float,
    progression: float,
    specificity: float,
    overall: float,
) -> dict:
    return {
        "dataset": "eval/outline_quality_samples.json",
        "total_samples": 4,
        "metrics": {
            "title_uniqueness_pass_rate": title,
            "key_point_uniqueness_pass_rate": keypoint,
            "cross_section_progression_pass_rate": progression,
            "expression_specificity_pass_rate": specificity,
            "overall_pass_rate": overall,
        },
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        title=0.90,
        keypoint=0.85,
        progression=0.88,
        specificity=0.84,
        overall=0.80,
    )
    current = _result_payload(
        title=0.87,
        keypoint=0.81,
        progression=0.84,
        specificity=0.80,
        overall=0.76,
    )

    result_path = tmp_path / "outline_result.json"
    baseline_path = tmp_path / "outline_baseline.json"
    current_path = tmp_path / "outline_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_title_uniqueness_drop=0.05,
            max_key_point_uniqueness_drop=0.05,
            max_cross_section_progression_drop=0.05,
            max_expression_specificity_drop=0.05,
            max_overall_drop=0.05,
        ),
        notes="outline quality baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_progression_and_overall(tmp_path):
    baseline = _result_payload(
        title=0.90,
        keypoint=0.85,
        progression=0.88,
        specificity=0.84,
        overall=0.80,
    )
    current = _result_payload(
        title=0.88,
        keypoint=0.84,
        progression=0.70,
        specificity=0.83,
        overall=0.70,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_title_uniqueness_drop": 0.05,
                    "max_key_point_uniqueness_drop": 0.05,
                    "max_cross_section_progression_drop": 0.05,
                    "max_expression_specificity_drop": 0.05,
                    "max_overall_drop": 0.05,
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
    assert any("cross_section_progression_pass_rate" in item for item in violations)
    assert any("overall_pass_rate" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps({"metrics": {"title_uniqueness_pass_rate": 1.0}}),
        encoding="utf-8",
    )
    current_path.write_text(
        json.dumps({"metrics": {"title_uniqueness_pass_rate": 1.0}}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
