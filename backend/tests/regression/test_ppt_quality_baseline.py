import json

import pytest

from eval.ppt_quality_baseline import Guardrails, check_regression, freeze_baseline


def _result_payload(
    *,
    structure: float,
    density: float,
    visual: float,
    expression: float,
    image_match: float,
    overall: float,
) -> dict:
    return {
        "dataset": "eval/ppt_quality_samples.json",
        "total_samples": 6,
        "metrics": {
            "structure_pass_rate": structure,
            "information_density_pass_rate": density,
            "visual_balance_pass_rate": visual,
            "expression_pass_rate": expression,
            "image_match_pass_rate": image_match,
            "overall_pass_rate": overall,
        },
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        structure=0.90,
        density=0.80,
        visual=0.85,
        expression=0.92,
        image_match=0.78,
        overall=0.72,
    )
    current = _result_payload(
        structure=0.88,
        density=0.77,
        visual=0.81,
        expression=0.89,
        image_match=0.72,
        overall=0.68,
    )

    result_path = tmp_path / "ppt_result.json"
    baseline_path = tmp_path / "ppt_baseline.json"
    current_path = tmp_path / "ppt_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(
            max_structure_drop=0.05,
            max_information_density_drop=0.05,
            max_visual_balance_drop=0.05,
            max_expression_drop=0.05,
            max_image_match_drop=0.08,
            max_overall_drop=0.05,
        ),
        notes="ppt quality baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_visual_and_overall(tmp_path):
    baseline = _result_payload(
        structure=0.90,
        density=0.80,
        visual=0.85,
        expression=0.92,
        image_match=0.78,
        overall=0.72,
    )
    current = _result_payload(
        structure=0.89,
        density=0.78,
        visual=0.70,
        expression=0.90,
        image_match=0.77,
        overall=0.60,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_structure_drop": 0.05,
                    "max_information_density_drop": 0.05,
                    "max_visual_balance_drop": 0.05,
                    "max_expression_drop": 0.05,
                    "max_image_match_drop": 0.08,
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
    assert any("visual_balance_pass_rate" in item for item in violations)
    assert any("overall_pass_rate" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps({"metrics": {"structure_pass_rate": 1.0}}),
        encoding="utf-8",
    )
    current_path.write_text(
        json.dumps({"metrics": {"structure_pass_rate": 1.0}}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
