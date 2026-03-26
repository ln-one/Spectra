import json

from eval.outline_quality_audit import compute_audit_metrics, run_audit


def test_compute_audit_metrics_tracks_outline_repetition_dimensions():
    samples = [
        {
            "id": "outline-1",
            "passes": {
                "title_uniqueness": False,
                "key_point_uniqueness": True,
                "cross_section_progression": False,
                "expression_specificity": True,
            },
            "issues": ["duplicate_title", "cross_section_repetition"],
        },
        {
            "id": "outline-2",
            "passes": {
                "title_uniqueness": True,
                "key_point_uniqueness": True,
                "cross_section_progression": True,
                "expression_specificity": True,
            },
            "issues": [],
        },
    ]

    metrics = compute_audit_metrics(samples)

    assert metrics.total_samples == 2
    assert metrics.title_uniqueness_pass_rate == 0.5
    assert metrics.cross_section_progression_pass_rate == 0.5
    assert metrics.overall_pass_rate == 0.5
    assert metrics.failed_sample_ids == ["outline-1"]
    assert metrics.failed_by_dimension["title_uniqueness"] == ["outline-1"]
    assert metrics.issue_tag_counts["duplicate_title"] == 1


def test_run_audit_writes_expected_payload(tmp_path):
    dataset_path = tmp_path / "outline_quality.json"
    output_path = tmp_path / "outline_quality_result.json"
    dataset_path.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "id": "outline-1",
                        "passes": {
                            "title_uniqueness": True,
                            "key_point_uniqueness": False,
                            "cross_section_progression": True,
                            "expression_specificity": True,
                        },
                        "issues": ["duplicate_key_point"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    metrics = run_audit(dataset_path=dataset_path, output_path=output_path)

    assert metrics.key_point_uniqueness_pass_rate == 0.0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["dataset"] == str(dataset_path)
    assert payload["metrics"]["overall_pass_rate"] == 0.0
    assert payload["metrics"]["issue_tag_counts"]["duplicate_key_point"] == 1
