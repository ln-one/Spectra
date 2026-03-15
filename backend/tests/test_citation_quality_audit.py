import json

import pytest

from eval.citation_quality_audit import compute_metrics, run_audit


def test_compute_metrics_basic():
    samples = [
        {
            "id": "pass",
            "expect_citation": True,
            "assistant_markdown": (
                '牛顿第二定律是 F=ma。<cite chunk_id="chunk-1"></cite>'
            ),
            "allowed_source_ids": ["chunk-1"],
            "source_map": {"chunk-1": "牛顿第二定律公式是 F=ma"},
        },
        {
            "id": "misquote",
            "expect_citation": True,
            "assistant_markdown": '引用错误来源。<cite chunk_id="chunk-x"></cite>',
            "allowed_source_ids": ["chunk-2"],
            "source_map": {"chunk-2": "正确来源文本"},
        },
        {
            "id": "empty",
            "expect_citation": True,
            "assistant_markdown": '空引用。<cite filename="a.pdf"></cite>',
            "allowed_source_ids": ["chunk-3"],
            "source_map": {"chunk-3": "空引用不应通过"},
        },
        {
            "id": "no-ref-needed",
            "expect_citation": False,
            "assistant_markdown": "先明确学段和目标。",
            "allowed_source_ids": [],
            "source_map": {},
        },
    ]

    m = compute_metrics(samples)
    assert m.total_samples == 4
    assert m.citation_coverage_rate == pytest.approx(2 / 3)
    assert m.misquote_rate == pytest.approx(1 / 4)
    assert m.paragraph_relevance_rate == pytest.approx(1.0)
    assert m.empty_citation_rate == pytest.approx(1 / 4)
    assert "misquote" in m.failed_misquote_ids
    assert "empty" in m.failed_empty_ids


def test_run_audit_writes_output(tmp_path):
    dataset = {
        "samples": [
            {
                "id": "s1",
                "expect_citation": True,
                "assistant_markdown": '定义可追溯。<cite chunk_id="chunk-1"></cite>',
                "allowed_source_ids": ["chunk-1"],
                "source_map": {"chunk-1": "定义可追溯"},
            }
        ]
    }
    dataset_path = tmp_path / "citation.json"
    output_path = tmp_path / "citation_result.json"
    dataset_path.write_text(json.dumps(dataset, ensure_ascii=False), encoding="utf-8")

    m = run_audit(dataset_path=dataset_path, output_path=output_path)
    assert m.citation_coverage_rate == pytest.approx(1.0)
    assert m.misquote_rate == pytest.approx(0.0)
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["citation_coverage_rate"] == pytest.approx(1.0)
