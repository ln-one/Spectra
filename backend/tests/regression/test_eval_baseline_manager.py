import json
import sys

import pytest

from eval.baseline_manager import Guardrails, check_regression, freeze_baseline, main


def _write_result(
    path,
    keyword=0.8,
    keyword_coverage=0.75,
    fact_coverage=0.70,
    usable_top1=0.50,
    usable_top3=0.80,
    distractor_intrusion=0.10,
    failure=0.1,
    latency=100.0,
    p95_latency=150.0,
    explainability=None,
    continuity=None,
    fallback_hit=None,
):
    metrics = {
        "keyword_hit_rate": keyword,
        "keyword_coverage_rate": keyword_coverage,
        "fact_coverage_rate": fact_coverage,
        "usable_top1_rate": usable_top1,
        "usable_top3_rate": usable_top3,
        "distractor_intrusion_rate": distractor_intrusion,
        "failure_rate": failure,
        "avg_latency_ms": latency,
        "p95_latency_ms": p95_latency,
        "hit_rate_at_k": {"1": 0.5, "3": 0.8},
        "mrr_at_k": {"1": 0.5},
        "ndcg_at_k": {"5": 0.6},
        "rankable_case_coverage_rate": 1.0,
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


def _guardrails(**overrides):
    base = dict(
        keyword_hit_rate_min_delta=-0.03,
        failure_rate_max_delta=0.05,
        avg_latency_ms_max_ratio=1.5,
    )
    base.update(overrides)
    return Guardrails(**base)


def test_freeze_baseline_writes_expected_fields(tmp_path):
    result = tmp_path / "result.json"
    baseline = tmp_path / "baseline.json"
    _write_result(result)

    payload = freeze_baseline(
        result_path=result,
        output_path=baseline,
        guardrails=_guardrails(),
        notes="v1",
    )

    assert baseline.exists()
    assert payload["baseline_version"] == "1"
    assert payload["notes"] == "v1"
    assert payload["metrics"]["keyword_hit_rate"] == pytest.approx(0.8)
    assert payload["guardrails"]["fact_coverage_rate_min_delta"] == pytest.approx(-0.03)
    assert payload["guardrails"]["usable_top1_rate_min_delta"] == pytest.approx(-0.05)
    assert payload["guardrails"][
        "distractor_intrusion_rate_max_delta"
    ] == pytest.approx(0.05)
    assert payload["guardrails"]["p95_latency_ms_max_ratio"] == pytest.approx(1.75)
    assert payload["guardrails"]["explainability_rate_hard_floor"] == pytest.approx(
        0.95
    )


def test_check_regression_passes_when_within_guardrails(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(
        baseline_result, keyword=0.8, failure=0.1, latency=100.0, p95_latency=150.0
    )
    _write_result(current, keyword=0.78, failure=0.12, latency=120.0, p95_latency=200.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=_guardrails(
            failure_rate_max_delta=0.05,
            avg_latency_ms_max_ratio=1.5,
            p95_latency_ms_max_ratio=1.75,
        ),
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
        guardrails=_guardrails(),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is False
    assert any("keyword_hit_rate" in msg for msg in violations)


def test_partial_guardrails_override_keeps_baseline_thresholds(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(
        baseline_result, keyword=0.8, failure=0.1, latency=100.0, p95_latency=180.0
    )
    _write_result(
        current, keyword=0.791, failure=0.16, latency=130.0, p95_latency=250.0
    )
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=_guardrails(
            failure_rate_max_delta=0.10,
            avg_latency_ms_max_ratio=2.0,
            p95_latency_ms_max_ratio=2.0,
        ),
        notes=None,
    )

    passed, violations = check_regression(
        current,
        baseline,
        guardrails_override=Guardrails(
            keyword_hit_rate_min_delta=-0.01,
            failure_rate_max_delta=0.10,
            avg_latency_ms_max_ratio=2.0,
            p95_latency_ms_max_ratio=2.0,
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

    _write_result(
        baseline_result, keyword=0.8, failure=0.1, latency=100.0, p95_latency=180.0
    )
    _write_result(current, keyword=0.79, failure=0.18, latency=180.0, p95_latency=300.0)
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=_guardrails(
            failure_rate_max_delta=0.10,
            avg_latency_ms_max_ratio=2.0,
            p95_latency_ms_max_ratio=2.0,
        ),
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
        guardrails=_guardrails(),
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
        explainability=0.94,
        continuity=0.96,
        fallback_hit=0.90,
    )
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=_guardrails(),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is False
    assert any("hard floor" in msg for msg in violations)


def test_check_regression_blocks_new_rag_usability_metric_drop(tmp_path):
    baseline_result = tmp_path / "baseline_result.json"
    current = tmp_path / "current.json"
    baseline = tmp_path / "baseline.json"

    _write_result(
        baseline_result,
        fact_coverage=0.80,
        usable_top1=0.60,
        usable_top3=0.90,
        distractor_intrusion=0.10,
        p95_latency=200.0,
    )
    _write_result(
        current,
        fact_coverage=0.70,
        usable_top1=0.48,
        usable_top3=0.82,
        distractor_intrusion=0.18,
        p95_latency=380.0,
    )
    freeze_baseline(
        result_path=baseline_result,
        output_path=baseline,
        guardrails=_guardrails(
            fact_coverage_rate_min_delta=-0.03,
            usable_top1_rate_min_delta=-0.05,
            usable_top3_rate_min_delta=-0.03,
            distractor_intrusion_rate_max_delta=0.05,
            p95_latency_ms_max_ratio=1.75,
        ),
        notes=None,
    )

    passed, violations = check_regression(current, baseline)
    assert passed is False
    assert any("fact_coverage_rate" in msg for msg in violations)
    assert any("usable_top1_rate" in msg for msg in violations)
    assert any("usable_top3_rate" in msg for msg in violations)
    assert any("distractor_intrusion_rate" in msg for msg in violations)
    assert any("p95_latency_ms" in msg for msg in violations)
