import json

from eval.ppt_image_quality_audit import compute_audit_metrics, run_audit


def test_compute_audit_metrics_tracks_image_dimensions_and_issues():
    samples = [
        {
            "id": "ppt-image-1",
            "passes": {
                "page_selection": True,
                "placement": False,
                "quantity": True,
                "layout_risk_control": False,
                "text_image_alignment": True,
            },
            "issues": ["placement", "layout_risk_control"],
        },
        {
            "id": "ppt-image-2",
            "passes": {
                "page_selection": True,
                "placement": True,
                "quantity": True,
                "layout_risk_control": True,
                "text_image_alignment": True,
            },
            "issues": [],
        },
    ]

    metrics = compute_audit_metrics(samples)

    assert metrics.total_samples == 2
    assert metrics.page_selection_pass_rate == 1.0
    assert metrics.placement_pass_rate == 0.5
    assert metrics.layout_risk_control_pass_rate == 0.5
    assert metrics.overall_pass_rate == 0.5
    assert metrics.failed_sample_ids == ["ppt-image-1"]
    assert metrics.failed_by_dimension["placement"] == ["ppt-image-1"]
    assert metrics.issue_tag_counts["placement"] == 1


def test_run_audit_writes_expected_payload(tmp_path):
    dataset_path = tmp_path / "ppt_image_samples.json"
    output_path = tmp_path / "ppt_image_result.json"
    dataset_path.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "id": "ppt-image-1",
                        "passes": {
                            "page_selection": True,
                            "placement": True,
                            "quantity": False,
                            "layout_risk_control": True,
                            "text_image_alignment": False,
                        },
                        "issues": ["quantity", "text_image_alignment"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    metrics = run_audit(dataset_path=dataset_path, output_path=output_path)

    assert metrics.quantity_pass_rate == 0.0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["dataset"] == str(dataset_path)
    assert payload["metrics"]["overall_pass_rate"] == 0.0
    assert payload["metrics"]["failed_by_dimension"]["quantity"] == ["ppt-image-1"]
