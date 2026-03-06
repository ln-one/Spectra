import json

import pytest

from eval.source_quality_audit import compute_audit_metrics, run_audit


def test_compute_audit_metrics_all_pass():
    samples = [
        {
            "id": "s1",
            "output_text": "牛顿第二定律公式是F=ma",
            "rag_results": [
                {
                    "content": "牛顿第二定律常写作F=ma",
                    "source": {
                        "chunk_id": "c1",
                        "source_type": "document",
                        "filename": "p.pdf",
                        "page_number": 1,
                    },
                }
            ],
        }
    ]

    m = compute_audit_metrics(samples)
    assert m.total_samples == 1
    assert m.coverage_rate == pytest.approx(1.0)
    assert m.readability_rate == pytest.approx(1.0)
    assert m.relevance_rate == pytest.approx(1.0)
    assert m.failed_sample_ids == []


def test_compute_audit_metrics_fail_missing_locator():
    samples = [
        {
            "id": "s2",
            "output_text": "视频讲了光合作用",
            "preview_sources": [
                {"chunk_id": "c2", "source_type": "video", "filename": "b.mp4"}
            ],
            "source_details": [{"content": "光合作用需要光能"}],
        }
    ]

    m = compute_audit_metrics(samples)
    assert m.coverage_rate == pytest.approx(1.0)
    assert m.readability_rate == pytest.approx(0.0)
    assert "s2" in m.failed_sample_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "samples": [
            {
                "id": "s3",
                "output_text": "本页有来源",
                "preview_sources": [
                    {
                        "chunk_id": "c3",
                        "source_type": "document",
                        "filename": "x.pdf",
                        "page_number": 3,
                        "preview_text": "本页有来源",
                    }
                ],
            }
        ]
    }
    dataset_path = tmp_path / "audit.json"
    output_path = tmp_path / "result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.coverage_rate == pytest.approx(1.0)
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert "metrics" in saved
    assert saved["metrics"]["coverage_rate"] == pytest.approx(1.0)
