from eval.metrics import EvalResult
from eval.run_eval import build_case_output_records


def test_build_case_output_records_includes_retrieved_contents_and_final_answer():
    cases = [
        {
            "id": "case-1",
            "query": "测试 query",
            "expected_keywords": ["关键词A"],
            "relevant_chunk_ids": ["chunk-1"],
            "usable_chunk_ids": ["chunk-1"],
        }
    ]
    eval_results = [
        EvalResult(
            case_id="case-1",
            query="测试 query",
            retrieved_chunk_ids=["chunk-1", "chunk-2"],
            retrieved_contents=["第一段命中文本", "第二段命中文本"],
            latency_ms=123.4,
            final_answer="这是最终答案",
        )
    ]

    output_cases = build_case_output_records(eval_results, cases)

    assert len(output_cases) == 1
    assert output_cases[0]["retrieved_contents"] == ["第一段命中文本", "第二段命中文本"]
    assert output_cases[0]["final_answer"] == "这是最终答案"
    assert output_cases[0]["retrieved_chunk_ids"] == ["chunk-1", "chunk-2"]

