"""
D1 预研 harness：解析 provider（local/mock）质量对比入口。

目标：在 C2 真实接入前，先用 local/mock 建立可重复的评测框架。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any

from eval.provider_comparison import QueryWithKeywords, compare_providers
from services.parsers.base import BaseParseProvider


class MockHighProvider(BaseParseProvider):
    name = "mock_high"
    supported_types = {"pdf", "word", "ppt", "other"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        text = Path(filepath).read_text(encoding="utf-8", errors="replace")
        return text, {"text_length": len(text), "pages_extracted": 1}


class MockLowProvider(BaseParseProvider):
    name = "mock_low"
    supported_types = {"pdf", "word", "ppt", "other"}

    def extract_text(
        self, filepath: str, filename: str, file_type: str
    ) -> tuple[str, dict[str, Any]]:
        text = Path(filepath).read_text(encoding="utf-8", errors="replace")
        # 人工制造低质量输出：截断 + 去掉部分句子
        lines = [ln for ln in text.splitlines() if ln.strip()]
        reduced = "\n".join(lines[: max(1, len(lines) // 2)])
        return reduced, {"text_length": len(reduced), "pages_extracted": 1}


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _build_content_files(
    samples: list[dict], workspace: Path
) -> list[tuple[str, str, str]]:
    files: list[tuple[str, str, str]] = []
    for idx, sample in enumerate(samples, start=1):
        filename = sample.get("filename", f"sample-{idx}.txt")
        file_type = sample.get("file_type", "other")
        content = sample.get("content", "")

        p = workspace / filename
        p.write_text(content, encoding="utf-8")
        files.append((str(p), filename, file_type))
    return files


def _build_queries(queries: list[dict]) -> list[QueryWithKeywords]:
    return [
        QueryWithKeywords(
            query=q.get("query", ""),
            expected_keywords=q.get("expected_keywords", []),
        )
        for q in queries
    ]


async def run_harness(
    sample_pool_path: Path,
    thresholds_path: Path,
    output_path: Path | None,
) -> dict:
    sample_pool = _load_json(sample_pool_path)
    thresholds = _load_json(thresholds_path)

    samples = sample_pool.get("samples", [])
    queries = _build_queries(sample_pool.get("queries", []))

    providers: list[BaseParseProvider] = [MockHighProvider(), MockLowProvider()]

    with tempfile.TemporaryDirectory(prefix="spectra_harness_") as tmp_dir:
        content_files = _build_content_files(samples, Path(tmp_dir))
        report = await compare_providers(
            providers=providers,
            content_files=content_files,
            queries_with_keywords=queries,
            baseline_provider=thresholds.get("baseline_provider", "mock_high"),
            regression_threshold=thresholds.get("regression_threshold", 0.2),
        )

    payload = {
        "baseline_provider": report.baseline_provider,
        "regression_threshold": report.regression_threshold,
        "reports": [
            {
                "provider_name": r.provider_name,
                "total_chunks": r.total_chunks,
                "avg_chunk_length": r.avg_chunk_length,
                "keyword_hit_rate": r.keyword_hit_rate,
                "search_results_count": r.search_results_count,
            }
            for r in report.reports
        ],
        "regressions": report.quality_regression_detected(),
        "summary": report.summary(),
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="D1 provider 预研 harness")
    parser.add_argument(
        "--sample-pool",
        default="eval/provider_sample_pool.json",
        help="样本池配置",
    )
    parser.add_argument(
        "--thresholds",
        default="eval/provider_thresholds.json",
        help="阈值配置",
    )
    parser.add_argument(
        "--output",
        default="eval/results/provider_harness_latest.json",
        help="输出路径",
    )
    args = parser.parse_args()

    payload = asyncio.run(
        run_harness(
            sample_pool_path=Path(args.sample_pool),
            thresholds_path=Path(args.thresholds),
            output_path=Path(args.output) if args.output else None,
        )
    )
    print(payload["summary"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
