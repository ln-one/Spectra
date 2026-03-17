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
    assert m.contract_consistency_rate == pytest.approx(1.0)
    assert m.session_isolation_rate == pytest.approx(0.0)
    assert m.gate_passed is False
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
    assert m.gate_passed is True
    assert output_path.exists()

    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert saved["metrics"]["hit_rate"] == pytest.approx(1.0)
    assert saved["metrics"]["gate_passed"] is True


def test_compute_metrics_contract_and_session_scope_gate():
    samples = [
        {
            "id": "ok-contract-1",
            "session_id": "s-1",
            "source_session_ids": ["s-1"],
            "expected_source_ids": ["chunk-1"],
            "used_source_ids": ["chunk-1"],
            "rag_hit": True,
            "observability_has_rag_context": True,
            "citations": [{"chunk_id": "chunk-1"}],
            "assistant_markdown": '结论<cite chunk_id="chunk-1"></cite>',
            "has_no_hit_notice": False,
        },
        {
            "id": "ok-contract-2",
            "session_id": "s-1",
            "source_session_ids": [],
            "expected_source_ids": [],
            "used_source_ids": [],
            "rag_hit": False,
            "observability_has_rag_context": False,
            "citations": [],
            "assistant_markdown": "未命中资料，请补充文档。",
            "has_no_hit_notice": True,
        },
        {
            "id": "bad-contract",
            "session_id": "s-1",
            "source_session_ids": ["s-1"],
            "expected_source_ids": ["chunk-2"],
            "used_source_ids": ["chunk-2"],
            "rag_hit": True,
            "observability_has_rag_context": True,
            "citations": [{"chunk_id": "chunk-2"}],
            "assistant_markdown": "结论无引用标签",
            "has_no_hit_notice": False,
        },
        {
            "id": "bad-session-scope",
            "session_id": "s-1",
            "source_session_ids": ["s-1", "s-2"],
            "expected_source_ids": ["chunk-3"],
            "used_source_ids": ["chunk-3"],
            "rag_hit": True,
            "observability_has_rag_context": True,
            "citations": [{"chunk_id": "chunk-3"}],
            "assistant_markdown": '补充<cite chunk_id="chunk-3"></cite>',
            "has_no_hit_notice": False,
        },
    ]

    m = compute_metrics(
        samples,
        min_hit_rate=0.0,
        max_misquote_rate=1.0,
        min_no_hit_notice_rate=0.0,
        min_contract_consistency_rate=1.0,
        min_session_isolation_rate=1.0,
    )

    assert m.contract_consistency_rate == pytest.approx(0.75)
    assert m.session_isolation_rate == pytest.approx(0.75)
    assert m.gate_passed is False
    assert "bad-contract" in m.failed_contract_ids
    assert "bad-session-scope" in m.failed_session_scope_ids
