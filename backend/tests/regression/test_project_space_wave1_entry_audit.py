import json

import pytest

from eval.project_space_wave1_entry_audit import compute_metrics, run_audit


def test_compute_metrics_all_pass():
    samples = [
        {
            "id": "s1",
            "capability": "ppt",
            "endpoint": "/api/v1/generate/sessions/s1/preview",
            "request": {"project_id": "p1", "session_id": "s1"},
        },
        {
            "id": "s2",
            "capability": "summary",
            "endpoint": "/api/v1/projects/p1/artifacts",
            "request": {"project_id": "p1", "session_id": ""},
        },
    ]

    metrics = compute_metrics(samples, min_contract_pass_rate=1.0)
    assert metrics.contract_pass_rate == pytest.approx(1.0)
    assert metrics.gate_passed is True
    assert metrics.failed_sample_ids == []


def test_compute_metrics_detects_invalid_route():
    samples = [
        {
            "id": "bad-route",
            "capability": "summary",
            "endpoint": "/api/v1/generate/sessions/s1/preview",
            "request": {"project_id": "p1", "session_id": "s1"},
        }
    ]

    metrics = compute_metrics(samples, min_contract_pass_rate=1.0)
    assert metrics.contract_pass_rate == pytest.approx(0.0)
    assert metrics.gate_passed is False
    assert "bad-route" in metrics.failed_sample_ids
    assert any("invalid endpoint" in reason for reason in metrics.failed_reasons)


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "thresholds": {"min_contract_pass_rate": 0.0},
        "samples": [
            {
                "id": "ok",
                "capability": "outline",
                "endpoint": "/api/v1/generate/sessions/s1/preview",
                "request": {"project_id": "p1", "session_id": "s1"},
            }
        ],
    }

    dataset_path = tmp_path / "wave1_dataset.json"
    output_path = tmp_path / "wave1_result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    metrics = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert metrics.gate_passed is True
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["gate_passed"] is True
