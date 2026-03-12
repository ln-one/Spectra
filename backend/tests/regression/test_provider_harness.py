import json

import pytest

from eval.provider_harness import run_harness


@pytest.mark.slow
def test_run_harness_outputs_summary(tmp_path):
    sample_pool = {
        "samples": [
            {
                "filename": "s1.txt",
                "file_type": "pdf",
                "content": "牛顿第二定律 F=ma 与加速度相关",
            }
        ],
        "queries": [{"query": "牛顿第二定律", "expected_keywords": ["F=ma"]}],
    }
    thresholds = {"baseline_provider": "mock_high", "regression_threshold": 0.2}

    sample_pool_path = tmp_path / "pool.json"
    thresholds_path = tmp_path / "thresholds.json"
    output_path = tmp_path / "out.json"

    sample_pool_path.write_text(
        json.dumps(sample_pool, ensure_ascii=False), encoding="utf-8"
    )
    thresholds_path.write_text(
        json.dumps(thresholds, ensure_ascii=False), encoding="utf-8"
    )

    payload = __import__("asyncio").run(
        run_harness(sample_pool_path, thresholds_path, output_path)
    )

    assert "summary" in payload
    assert output_path.exists()
    saved = json.loads(output_path.read_text(encoding="utf-8"))
    assert "reports" in saved
    assert saved["baseline_provider"] == "mock_high"
