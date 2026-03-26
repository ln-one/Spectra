import json

from eval.ppt_quality_comparison_audit import compute_metrics, run_audit


def test_compute_metrics_tracks_overall_and_dimension_improvement():
    samples = [
        {
            "id": "ppt-1",
            "before": {
                "passes": {
                    "structure": True,
                    "information_density": False,
                    "visual_balance": True,
                    "expression": True,
                    "image_match": False,
                }
            },
            "after": {
                "passes": {
                    "structure": True,
                    "information_density": True,
                    "visual_balance": True,
                    "expression": True,
                    "image_match": True,
                }
            },
        },
        {
            "id": "ppt-2",
            "before": {
                "passes": {
                    "structure": True,
                    "information_density": True,
                    "visual_balance": True,
                    "expression": True,
                    "image_match": True,
                }
            },
            "after": {
                "passes": {
                    "structure": True,
                    "information_density": True,
                    "visual_balance": True,
                    "expression": True,
                    "image_match": True,
                }
            },
        },
    ]

    metrics = compute_metrics(samples)

    assert metrics.total_samples == 2
    assert metrics.overall_improvement_rate == 0.5
    assert metrics.dimension_improvement_rate["information_density"] == 0.5
    assert metrics.dimension_improvement_rate["image_match"] == 0.5
    assert metrics.improved_sample_ids == ["ppt-1"]
    assert metrics.non_improved_sample_ids == ["ppt-2"]


def test_run_audit_writes_expected_payload(tmp_path):
    dataset_path = tmp_path / "ppt_compare.json"
    output_path = tmp_path / "ppt_compare_result.json"
    dataset_path.write_text(
        json.dumps(
            {
                "samples": [
                    {
                        "id": "ppt-1",
                        "before": {
                            "passes": {
                                "structure": False,
                                "information_density": True,
                                "visual_balance": True,
                                "expression": False,
                                "image_match": True,
                            }
                        },
                        "after": {
                            "passes": {
                                "structure": True,
                                "information_density": True,
                                "visual_balance": True,
                                "expression": True,
                                "image_match": True,
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
    assert payload["metrics"]["dimension_improvement_rate"]["structure"] == 1.0
    assert payload["metrics"]["improved_sample_ids"] == ["ppt-1"]
