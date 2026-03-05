import json
import sys

import pytest

from eval.baseline_manager import Guardrails, check_regression, freeze_baseline, main


def _write_result(
    path,
    keyword=0.8,
    failure=0.1,
    latency=100.0,
    explainability=None,
    continuity=None,
    fallback_hit=None,
):
    metrics = {
        "keyword_hit_rate": keyword,
        "failure_rate": failure,
        "avg_latency_ms": latency,
        "hit_rate_at_k": {"1": 0.5},
        "mrr_at_k": {"1": 0.5},
        "failed_case_ids": [],
    }
    if explainability is not None:
        metrics["explainability_rate"] = explainability
    if continuity is not None:
        metrics["continuity_rate"] = continuity
    if fallback_hit is not None:
        metrics["fallback_hit_rate"] = fallback_hit

    payload = {
        "tool_version": "rag-eval-v1",
        "dataset_version": "1.0",
        "dataset_path": "eval/dataset.json",
        "dataset_sha256": "abc",
        "top_k": 5,
        "metrics": metrics,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_freeze_baseline_writes_expected_fields(tmp_path):
    result = tmp_path / "result.json"
    baseline = tmp_path / "baseline.json"
    _write_result(result)

    payload = freeze_baseline(
        result_path=result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.05, 1.5),
        notes="v1",
    )

    assert baseline.exists()
    assert payload["baseline_version"] == "1"
    assert payload["notes"] == "v1"
    assert payload["metrics"]["keyword_hit_rate"] == pytest.approx(0.8)
    assert payload["guardrails"]["explainability_rate_hard_floor"] == pytest.approx(0.95)


def test_check_regression_passes_when_within_guardrails(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(baseline_result, keyword=0.8, failure=0.1, latency=100.0)
    _write_result(current, keyword=0.78, failure=0.12, latency=120.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.05, 1.5),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is True
    assert violations == []


def test_check_regression_fails_when_keyword_drop_exceeds_threshold(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(baseline_result, keyword=0.8, failure=0.1, latency=100.0)
    _write_result(current, keyword=0.7, failure=0.1, latency=100.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.05, 1.5),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is False
    assert any("keyword_hit_rate" in msg for msg in violations)


def test_partial_guardrails_override_keeps_baseline_thresholds(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(baseline_result, keyword=0.8, failure=0.1, latency=100.0)
    _write_result(current, keyword=0.791, failure=0.16, latency=130.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.10, 2.0),
        notes=None,
    )

    # 仅覆盖 keyword 阈值，failure/latency 阈值应沿用 baseline 的 0.10 / 2.0
    passed, violations = check_regression(
        current,
        baseline,
        guardrails_override=Guardrails(
            keyword_hit_rate_min_delta=-0.01,
            failure_rate_max_delta=0.10,
            avg_latency_ms_max_ratio=2.0,
        ),
    )
    assert passed is True
    assert violations == []


def test_cli_check_partial_override_uses_baseline_for_unspecified_fields(
    tmp_path, monkeypatch, capsys
):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(baseline_result, keyword=0.8, failure=0.1, latency=100.0)
    _write_result(current, keyword=0.79, failure=0.18, latency=180.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.10, 2.0),
        notes=None,
    )

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "baseline_manager.py",
            "check",
            "--current",
            str(current),
            "--baseline",
            str(baseline),
            "--keyword-hit-rate-min-delta",
            "-0.02",
        ],
    )

    rc = main()
    captured = capsys.readouterr()
    assert rc == 0
    assert "基线校验通过" in captured.out


def test_check_regression_with_d5_metrics_passes(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(
        baseline_result,
        keyword=0.8,
        failure=0.1,
        latency=100.0,
        explainability=0.98,
        continuity=0.97,
        fallback_hit=0.93,
    )
    _write_result(
        current,
        keyword=0.79,
        failure=0.11,
        latency=110.0,
        explainability=0.97,
        continuity=0.96,
        fallback_hit=0.90,
    )
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.05, 1.5),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is True
    assert violations == []


def test_check_regression_with_d5_hard_floor_blocks_low_baseline(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(
        baseline_result,
        keyword=0.8,
        failure=0.1,
        latency=100.0,
        explainability=0.97,
        continuity=0.96,
        fallback_hit=0.90,
    )
    _write_result(
        current,
        keyword=0.8,
        failure=0.1,
        latency=100.0,
        explainability=0.94,  # 低于 hard floor 0.95
        continuity=0.96,
        fallback_hit=0.90,
    )
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=Guardrails(-0.03, 0.05, 1.5),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is False
    assert any("hard floor" in msg for msg in violations)
