"""
RAG 评测指标单元测试

测试 metrics.py 中的计算逻辑，不依赖真实 API。
"""

import pytest

from eval.metrics import (
    EvalResult,
    compute_hit_rate,
    compute_mrr,
    compute_keyword_hit_rate,
    compute_metrics,
)


def make_result(case_id, chunk_ids, contents=None, latency=50.0, error=None):
    return EvalResult(
        case_id=case_id,
        query=f"query for {case_id}",
        retrieved_chunk_ids=chunk_ids,
        retrieved_contents=contents or [f"content {i}" for i in chunk_ids],
        latency_ms=latency,
        error=error,
    )


CASES = [
    {
        "id": "c1",
        "query": "光合作用",
        "expected_keywords": ["叶绿体", "光能"],
        "relevant_chunk_ids": ["chunk-a", "chunk-b"],
    },
    {
        "id": "c2",
        "query": "牛顿定律",
        "expected_keywords": ["加速度", "合力"],
        "relevant_chunk_ids": ["chunk-c"],
    },
    {
        "id": "c3",
        "query": "无关键词用例",
        "expected_keywords": [],
        "relevant_chunk_ids": [],
    },
]


class TestEvalResult:
    def test_not_failed_when_has_results(self):
        r = make_result("c1", ["chunk-a"])
        assert not r.failed

    def test_failed_when_empty_results(self):
        r = make_result("c1", [])
        assert r.failed

    def test_failed_when_error(self):
        r = make_result("c1", ["chunk-a"], error="timeout")
        assert r.failed


class TestHitRate:
    def test_hit_at_1_exact(self):
        results = [make_result("c1", ["chunk-a", "chunk-x"])]
        rate = compute_hit_rate(results, CASES, k=1)
        assert rate == 1.0

    def test_miss_at_1(self):
        results = [make_result("c1", ["chunk-x", "chunk-a"])]
        rate = compute_hit_rate(results, CASES, k=1)
        assert rate == 0.0

    def test_hit_at_3(self):
        results = [make_result("c1", ["chunk-x", "chunk-y", "chunk-a"])]
        rate = compute_hit_rate(results, CASES, k=3)
        assert rate == 1.0

    def test_partial_hit(self):
        # c1 命中，c2 未命中
        results = [
            make_result("c1", ["chunk-a"]),
            make_result("c2", ["chunk-x"]),
        ]
        rate = compute_hit_rate(results, CASES, k=5)
        assert rate == 0.5

    def test_skip_cases_without_relevant_ids(self):
        # c3 没有 relevant_chunk_ids，不计入分母
        results = [make_result("c3", ["chunk-x"])]
        rate = compute_hit_rate(results, CASES, k=5)
        assert rate == 0.0  # total=0，返回 0.0

    def test_skip_failed_results(self):
        results = [make_result("c1", [], error="err")]
        rate = compute_hit_rate(results, CASES, k=5)
        assert rate == 0.0


class TestMRR:
    def test_first_rank(self):
        results = [make_result("c1", ["chunk-a", "chunk-x"])]
        mrr = compute_mrr(results, CASES, k=5)
        assert mrr == pytest.approx(1.0)

    def test_second_rank(self):
        results = [make_result("c1", ["chunk-x", "chunk-a"])]
        mrr = compute_mrr(results, CASES, k=5)
        assert mrr == pytest.approx(0.5)

    def test_no_hit(self):
        results = [make_result("c1", ["chunk-x", "chunk-y"])]
        mrr = compute_mrr(results, CASES, k=5)
        assert mrr == pytest.approx(0.0)

    def test_average_across_cases(self):
        results = [
            make_result("c1", ["chunk-a"]),  # RR = 1.0
            make_result("c2", ["chunk-x", "chunk-c"]),  # RR = 0.5
        ]
        mrr = compute_mrr(results, CASES, k=5)
        assert mrr == pytest.approx(0.75)


class TestKeywordHitRate:
    def test_keyword_found(self):
        results = [make_result("c1", ["x"], contents=["叶绿体进行光合作用"])]
        rate = compute_keyword_hit_rate(results, CASES)
        assert rate == 1.0

    def test_keyword_not_found(self):
        results = [make_result("c1", ["x"], contents=["完全无关的内容"])]
        rate = compute_keyword_hit_rate(results, CASES)
        assert rate == 0.0

    def test_skip_empty_keywords(self):
        results = [make_result("c3", ["x"], contents=["任意内容"])]
        rate = compute_keyword_hit_rate(results, CASES)
        assert rate == 0.0

    def test_partial_keyword_match(self):
        results = [
            make_result("c1", ["x"], contents=["叶绿体"]),  # 命中
            make_result("c2", ["x"], contents=["无关内容"]),  # 未命中
        ]
        rate = compute_keyword_hit_rate(results, CASES)
        assert rate == pytest.approx(0.5)


class TestComputeMetrics:
    def test_full_metrics(self):
        results = [
            make_result("c1", ["chunk-a"], contents=["叶绿体光能"], latency=30.0),
            make_result("c2", ["chunk-c"], contents=["加速度合力"], latency=50.0),
        ]
        m = compute_metrics(results, CASES, k_values=[1, 5])
        assert m.total_cases == 2
        assert m.failure_rate == 0.0
        assert m.avg_latency_ms == pytest.approx(40.0)
        assert m.keyword_hit_rate == pytest.approx(1.0)
        assert m.hit_rate_at_k[1] == pytest.approx(1.0)
        assert m.mrr_at_k[1] == pytest.approx(1.0)

    def test_failure_rate(self):
        results = [
            make_result("c1", ["chunk-a"]),
            make_result("c2", [], error="timeout"),
        ]
        m = compute_metrics(results, CASES)
        assert m.failure_rate == pytest.approx(0.5)
        assert "c2" in m.failed_case_ids

    def test_summary_output(self):
        results = [make_result("c1", ["chunk-a"], contents=["叶绿体"])]
        m = compute_metrics(results, CASES)
        summary = m.summary()
        assert "总用例数" in summary
        assert "失败率" in summary
        assert "关键词命中率" in summary

    def test_default_k_values(self):
        results = [make_result("c1", ["chunk-a"])]
        m = compute_metrics(results, CASES)
        assert set(m.hit_rate_at_k.keys()) == {1, 3, 5}
        assert set(m.mrr_at_k.keys()) == {1, 3, 5}
