import json

import pytest

from eval.ppt_image_quality_baseline import (
    Guardrails,
    check_regression,
    freeze_baseline,
)


def _result_payload(
    *,
    selection: float,
    placement: float,
    quantity: float,
    risk: float,
    alignment: float,
    overall: float,
) -> dict:
    return {
        "dataset": "eval/ppt_image_quality_samples.json",
        "total_samples": 4,
        "metrics": {
            "page_selection_pass_rate": selection,
            "placement_pass_rate": placement,
            "quantity_pass_rate": quantity,
            "layout_risk_control_pass_rate": risk,
            "text_image_alignment_pass_rate": alignment,
            "overall_pass_rate": overall,
        },
    }


def test_freeze_baseline_and_check_pass(tmp_path):
    baseline_source = _result_payload(
        selection=0.90,
        placement=0.85,
        quantity=0.88,
        risk=0.90,
        alignment=0.86,
        overall=0.80,
    )
    current = _result_payload(
        selection=0.86,
        placement=0.83,
        quantity=0.84,
        risk=0.87,
        alignment=0.82,
        overall=0.77,
    )

    result_path = tmp_path / "ppt_image_result.json"
    baseline_path = tmp_path / "ppt_image_baseline.json"
    current_path = tmp_path / "ppt_image_current.json"
    result_path.write_text(json.dumps(baseline_source), encoding="utf-8")
    current_path.write_text(json.dumps(current), encoding="utf-8")

    freeze_baseline(
        result_path=result_path,
        output_path=baseline_path,
        guardrails=Guardrails(),
        notes="ppt image quality baseline",
    )

    passed, violations = check_regression(
        current_path=current_path,
        baseline_path=baseline_path,
    )
    assert passed is True
    assert violations == []


def test_check_regression_fail_on_selection_and_overall(tmp_path):
    baseline = _result_payload(
        selection=0.90,
        placement=0.85,
        quantity=0.88,
        risk=0.90,
        alignment=0.86,
        overall=0.80,
    )
    current = _result_payload(
        selection=0.80,
        placement=0.84,
        quantity=0.86,
        risk=0.88,
        alignment=0.84,
        overall=0.70,
    )

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps(
            {
                "metrics": baseline["metrics"],
                "guardrails": {
                    "max_page_selection_drop": 0.05,
                    "max_placement_drop": 0.05,
                    "max_quantity_drop": 0.05,
                    "max_layout_risk_control_drop": 0.05,
                    "max_text_image_alignment_drop": 0.05,
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
    assert any("page_selection_pass_rate" in item for item in violations)
    assert any("overall_pass_rate" in item for item in violations)


def test_check_regression_raises_for_missing_metrics(tmp_path):
    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"
    baseline_path.write_text(
        json.dumps({"metrics": {"page_selection_pass_rate": 1.0}}),
        encoding="utf-8",
    )
    current_path.write_text(
        json.dumps({"metrics": {"page_selection_pass_rate": 1.0}}),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        check_regression(current_path=current_path, baseline_path=baseline_path)
