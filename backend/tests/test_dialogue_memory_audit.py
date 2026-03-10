import json

import pytest

from eval.dialogue_memory_audit import compute_metrics, run_audit


def test_compute_metrics_basic():
    samples = [
        {
            "id": "ok-hit",
            "expected_source_ids": ["c1"],
            "used_source_ids": ["c1"],
            "has_no_hit_notice": False,
        },
        {
            "id": "ok-no-hit-notice",
            "expected_source_ids": [],
            "used_source_ids": [],
            "has_no_hit_notice": True,
        },
        {
            "id": "bad-misquote",
            "expected_source_ids": ["c2"],
            "used_source_ids": ["c3"],
            "has_no_hit_notice": False,
        },
    ]

    m = compute_metrics(samples)
    assert m.total_samples == 3
    assert m.hit_rate == pytest.approx(0.5)
    assert m.misquote_rate == pytest.approx(1 / 3)
    assert m.no_hit_notice_rate == pytest.approx(1.0)
    assert "bad-misquote" in m.failed_hit_ids
    assert "bad-misquote" in m.failed_misquote_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "samples": [
            {
                "id": "s1",
                "expected_source_ids": ["c1"],
                "used_source_ids": ["c1"],
                "has_no_hit_notice": False,
            }
        ]
    }
    dataset_path = tmp_path / "dialogue.json"
    output_path = tmp_path / "result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.hit_rate == pytest.approx(1.0)
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["hit_rate"] == pytest.approx(1.0)

