from eval.stratumind_rerank_eval import latency_summary, percentile, summarize_scenario
from eval.metrics import EvalResult


def _case_result(case_id: str, *, latency: float, failed: bool = False, stages=None):
    from eval.stratumind_rerank_eval import SearchCaseResult

    return SearchCaseResult(
        eval_result=EvalResult(
            case_id=case_id,
            query=f"query-{case_id}",
            retrieved_chunk_ids=[] if failed else [f"chunk-{case_id}"],
            retrieved_contents=[] if failed else [f"content-{case_id}"],
            latency_ms=latency,
            error="boom" if failed else None,
        ),
        ranking_stages=stages or [],
        rerank_score_count=0,
        base_score_count=0,
    )


def test_percentile_interpolates():
    assert percentile([10, 20, 30, 40], 0.5) == 25.0
    assert percentile([10, 20, 30, 40], 0.95) == 38.5


def test_latency_summary_reports_percentiles():
    summary = latency_summary(
        [
            EvalResult("a", "q", ["1"], ["c"], 10.0),
            EvalResult("b", "q", ["1"], ["c"], 20.0),
            EvalResult("c", "q", ["1"], ["c"], 30.0),
        ]
    )
    assert summary["avg_ms"] == 20.0
    assert summary["p50_ms"] == 20.0
    assert summary["max_ms"] == 30.0


def test_summarize_scenario_tracks_rerank_coverage():
    summary = summarize_scenario(
        "rerank",
        [
            _case_result("a", latency=10.0, stages=["rerank", "rerank"]),
            _case_result("b", latency=20.0, stages=["", "rerank"]),
        ],
        [
            {
                "id": "a",
                "query": "qa",
                "expected_keywords": [],
                "relevant_chunk_ids": [],
            },
            {
                "id": "b",
                "query": "qb",
                "expected_keywords": [],
                "relevant_chunk_ids": [],
            },
        ],
    )
    assert summary.name == "rerank"
    assert summary.rerank_coverage_rate == 0.75
