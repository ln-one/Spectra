import json

import pytest

from eval.network_resource_quality_audit import compute_metrics, run_audit


def test_compute_metrics_basic():
    samples = [
        {
            "id": "s1",
            "query": "牛顿第二定律 实验",
            "web_resources": [
                {
                    "id": "good-web",
                    "title": "牛顿第二定律实验课",
                    "url": "https://example.com/newton",
                    "content": "牛顿第二定律实验课教学流程，含课堂提问与误区纠正。 "
                    * 4,
                },
                {
                    "id": "bad-web",
                    "title": "广告",
                    "url": "https://spam.example.com/ad",
                    "content": "点我",
                },
            ],
            "expected_reject_resource_ids": ["bad-web"],
        }
    ]
    m = compute_metrics(samples)
    assert m.total_samples == 1
    assert m.normalization_rate == pytest.approx(1.0)
    assert m.relevance_pass_rate == pytest.approx(1.0)
    assert m.low_quality_reject_rate == pytest.approx(1.0)
    assert m.citation_ready_rate == pytest.approx(1.0)
    assert m.gate_passed is True


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "samples": [
            {
                "id": "s2",
                "query": "课堂导入 提问",
                "audio_id": "a1",
                "audio_filename": "a.wav",
                "audio_segments": [
                    {
                        "start": 0.0,
                        "end": 4.0,
                        "text": "今天先做课堂导入提问，再进入实验。",
                        "confidence": 0.9,
                    }
                ],
            }
        ]
    }
    dataset_path = tmp_path / "network_samples.json"
    output_path = tmp_path / "network_audit_result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.total_samples == 1
    assert m.citation_ready_rate == pytest.approx(1.0)
    assert m.gate_passed is True
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["citation_ready_rate"] == pytest.approx(1.0)
    assert saved["metrics"]["gate_passed"] is True


def test_compute_metrics_gate_can_fail():
    samples = [
        {
            "id": "bad",
            "query": "牛顿第二定律",
            "web_resources": [
                {
                    "id": "w1",
                    "title": "广告",
                    "url": "https://spam.example.com/ad",
                    "content": "点我",
                }
            ],
            "expected_reject_resource_ids": [],
        }
    ]
    m = compute_metrics(
        samples,
        min_normalization_rate=1.0,
        min_relevance_pass_rate=1.0,
        min_low_quality_reject_rate=1.0,
        min_citation_ready_rate=1.0,
    )
    assert m.gate_passed is False
