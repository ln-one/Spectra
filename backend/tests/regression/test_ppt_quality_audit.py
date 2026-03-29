import json

from eval.ppt_quality_audit import compute_audit_metrics, run_audit


def test_compute_audit_metrics_tracks_dimensions_and_issues():
    samples = [
        {
            "id": "ppt-1",
            "passes": {
                "structure": True,
                "information_density": False,
                "visual_balance": True,
                "expression": True,
                "image_match": False,
            },
            "issues": ["information_density", "image_match"],
        },
        {
            "id": "ppt-2",
            "passes": {
                "structure": True,
                "information_density": True,
                "visual_balance": True,
                "expression": True,
                "image_match": True,
            },
            "issues": [],
        },
    ]

    metrics = compute_audit_metrics(samples)

    assert metrics.total_samples == 2
    assert metrics.structure_pass_rate == 1.0
    assert metrics.information_density_pass_rate == 0.5
    assert metrics.image_match_pass_rate == 0.5
    assert metrics.overall_pass_rate == 0.5
    assert metrics.failed_sample_ids == ["ppt-1"]
    assert metrics.failed_by_dimension["information_density"] == ["ppt-1"]
    assert metrics.failed_by_dimension["image_match"] == ["ppt-1"]
    assert metrics.issue_tag_counts["information_density"] == 1
    assert metrics.issue_tag_counts["image_match"] == 1


def test_run_audit_writes_expected_payload(tmp_path):
    dataset_path = tmp_path / "ppt_samples.json"
    output_path = tmp_path / "ppt_result.json"
    dataset_path.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "id": "ppt-1",
                        "passes": {
                            "structure": True,
                            "information_density": True,
                            "visual_balance": False,
                            "expression": True,
                            "image_match": True,
                        },
                        "issues": ["visual_balance"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    metrics = run_audit(dataset_path=dataset_path, output_path=output_path)

    assert metrics.visual_balance_pass_rate == 0.0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["dataset"] == str(dataset_path)
    assert payload["metrics"]["overall_pass_rate"] == 0.0
    assert payload["metrics"]["failed_by_dimension"]["visual_balance"] == ["ppt-1"]
