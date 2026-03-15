import json

import pytest

from eval.router_quality_audit import compute_metrics, run_audit


def test_compute_metrics_with_fallback_and_gate_pass():
    samples = [
        {
            "id": "light-pass",
            "task": "intent_classification",
            "quality_large": 0.95,
            "quality_small": 0.94,
            "latency_large_ms": 800,
            "latency_small_ms": 200,
            "cost_large": 0.02,
            "cost_small": 0.005,
            "small_model_success": True,
        },
        {
            "id": "light-fallback",
            "task": "short_text_polish",
            "quality_large": 0.92,
            "quality_small": 0.70,
            "latency_large_ms": 700,
            "latency_small_ms": 180,
            "cost_large": 0.018,
            "cost_small": 0.004,
            "small_model_success": False,
        },
        {
            "id": "heavy",
            "task": "rag_deep_summary",
            "has_rag_context": True,
            "quality_large": 0.96,
            "quality_small": 0.80,
            "latency_large_ms": 1300,
            "latency_small_ms": 400,
            "cost_large": 0.04,
            "cost_small": 0.012,
            "small_model_success": True,
            "critical": True,
        },
    ]

    m = compute_metrics(samples)
    assert m.total_samples == 3
    assert m.fallback_rate == pytest.approx(1 / 3)
    assert m.non_degradable_misroute_rate == pytest.approx(0.0)
    assert "light-fallback" in m.fallback_ids
    assert m.gate_passed is True


def test_compute_metrics_non_degradable_misroute_fails_gate():
    samples = [
        {
            "id": "misroute",
            "task": "short_text_polish",
            "non_degradable": True,
            "quality_large": 0.93,
            "quality_small": 0.91,
            "latency_large_ms": 650,
            "latency_small_ms": 180,
            "cost_large": 0.017,
            "cost_small": 0.004,
            "small_model_success": True,
        }
    ]

    m = compute_metrics(samples)
    assert m.non_degradable_misroute_rate == pytest.approx(1.0)
    assert m.gate_passed is False
    assert "misroute" in m.failed_non_degradable_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "large_model": "qwen-max",
        "small_model": "qwen-turbo",
        "samples": [
            {
                "id": "s1",
                "task": "intent_classification",
                "quality_large": 0.95,
                "quality_small": 0.94,
                "latency_large_ms": 800,
                "latency_small_ms": 200,
                "cost_large": 0.02,
                "cost_small": 0.005,
                "small_model_success": True,
            }
        ],
    }
    dataset_path = tmp_path / "router_samples.json"
    output_path = tmp_path / "router_audit_result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.total_samples == 1
    assert m.gate_passed is True
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["gate_passed"] is True
