import json

import pytest

from eval.outline_flow_audit import compute_metrics, run_audit


def test_compute_metrics_basic():
    samples = [
        {
            "id": "good",
            "min_sections": 3,
            "draft_outline": {"sections": ["a", "b", "c"]},
            "draft_score": 0.6,
            "rewrite_score": 0.8,
            "confirm_outline": {"sections": ["a", "b", "c"]},
            "confirm_ready": True,
        },
        {
            "id": "bad",
            "min_sections": 3,
            "draft_outline": {"sections": ["a"]},
            "draft_score": 0.6,
            "rewrite_score": 0.5,
            "confirm_outline": {"sections": ["a", "b"]},
            "confirm_ready": False,
        },
    ]

    m = compute_metrics(samples)
    assert m.total_samples == 2
    assert m.draft_structure_pass_rate == pytest.approx(0.5)
    assert m.rewrite_improvement_rate == pytest.approx(0.5)
    assert m.confirm_ready_rate == pytest.approx(0.5)
    assert "bad" in m.failed_draft_ids
    assert "bad" in m.failed_rewrite_ids
    assert "bad" in m.failed_confirm_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "samples": [
            {
                "id": "s1",
                "min_sections": 3,
                "draft_outline": {"sections": ["a", "b", "c"]},
                "draft_score": 0.5,
                "rewrite_score": 0.7,
                "confirm_outline": {"sections": ["a", "b", "c"]},
                "confirm_ready": True,
            }
        ]
    }
    dataset_path = tmp_path / "outline.json"
    output_path = tmp_path / "result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.confirm_ready_rate == pytest.approx(1.0)
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["confirm_ready_rate"] == pytest.approx(1.0)
