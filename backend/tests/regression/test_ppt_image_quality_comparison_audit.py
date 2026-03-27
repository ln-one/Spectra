import json

from eval.ppt_image_quality_comparison_audit import compute_metrics, run_audit


def test_compute_metrics_tracks_overall_and_dimension_improvement():
    samples = [
        {
            "id": "ppt-image-1",
            "before": {
                "passes": {
                    "page_selection": False,
                    "placement": False,
                    "quantity": True,
                    "layout_risk_control": False,
                    "text_image_alignment": True,
                }
            },
            "after": {
                "passes": {
                    "page_selection": True,
                    "placement": True,
                    "quantity": True,
                    "layout_risk_control": True,
                    "text_image_alignment": True,
                }
            },
        },
        {
            "id": "ppt-image-2",
            "before": {
                "passes": {
                    "page_selection": True,
                    "placement": True,
                    "quantity": True,
                    "layout_risk_control": True,
                    "text_image_alignment": True,
                }
            },
            "after": {
                "passes": {
                    "page_selection": True,
                    "placement": True,
                    "quantity": True,
                    "layout_risk_control": True,
                    "text_image_alignment": True,
                }
            },
        },
    ]

    metrics = compute_metrics(samples)

    assert metrics.total_samples == 2
    assert metrics.overall_improvement_rate == 0.5
    assert metrics.dimension_improvement_rate["page_selection"] == 0.5
    assert metrics.dimension_improvement_rate["placement"] == 0.5
    assert metrics.improved_sample_ids == ["ppt-image-1"]
    assert metrics.non_improved_sample_ids == ["ppt-image-2"]


def test_run_audit_writes_expected_payload(tmp_path):
    dataset_path = tmp_path / "ppt_image_compare.json"
    output_path = tmp_path / "ppt_image_compare_result.json"
    dataset_path.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "id": "ppt-image-1",
                        "before": {
                            "passes": {
                                "page_selection": True,
                                "placement": False,
                                "quantity": False,
                                "layout_risk_control": False,
                                "text_image_alignment": True,
                            }
                        },
                        "after": {
                            "passes": {
                                "page_selection": True,
                                "placement": True,
                                "quantity": True,
                                "layout_risk_control": True,
                                "text_image_alignment": True,
                            }
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    metrics = run_audit(dataset_path=dataset_path, output_path=output_path)

    assert metrics.overall_improvement_rate == 1.0
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["metrics"]["dimension_improvement_rate"]["placement"] == 1.0
    assert payload["metrics"]["improved_sample_ids"] == ["ppt-image-1"]
