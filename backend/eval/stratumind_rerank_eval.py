"""
Stratumind rerank comparison eval.

Compare:
- baseline Stratumind search (rerank disabled)
- reranked Stratumind search (rerank enabled)
- optional direct Dualweave rerank latency on baseline candidates

Usage:
    cd backend
    python eval/stratumind_rerank_eval.py \
      --project-id <project_id> \
      --baseline-stratumind-base-url http://127.0.0.1:8111 \
      --rerank-stratumind-base-url http://127.0.0.1:8110 \
      --dualweave-base-url http://127.0.0.1:8080
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402

from eval.metrics import EvalResult, compute_metrics  # noqa: E402


@dataclass
class SearchCaseResult:
    eval_result: EvalResult
    ranking_stages: list[str]
    rerank_score_count: int
    base_score_count: int


@dataclass
class ScenarioSummary:
    name: str
    metrics: dict[str, Any]
    latency: dict[str, float]
    rerank_coverage_rate: float


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    ordered = sorted(values)
    rank = (len(ordered) - 1) * pct
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return ordered[lower]
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def latency_summary(results: list[EvalResult]) -> dict[str, float]:
    values = [r.latency_ms for r in results]
    if not values:
        return {
            "avg_ms": 0.0,
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
            "max_ms": 0.0,
        }
    return {
        "avg_ms": round(statistics.mean(values), 2),
        "p50_ms": round(percentile(values, 0.50), 2),
        "p95_ms": round(percentile(values, 0.95), 2),
        "p99_ms": round(percentile(values, 0.99), 2),
        "max_ms": round(max(values), 2),
    }


def summarize_scenario(
    name: str, case_results: list[SearchCaseResult], cases: list[dict[str, Any]]
) -> ScenarioSummary:
    eval_results = [item.eval_result for item in case_results]
    metrics = compute_metrics(eval_results, cases)
    rerank_coverage_rate = 0.0
    total_results = 0
    reranked_results = 0
    for item in case_results:
        total_results += len(item.ranking_stages)
        reranked_results += sum(1 for stage in item.ranking_stages if stage == "rerank")
    if total_results > 0:
        rerank_coverage_rate = reranked_results / total_results
    return ScenarioSummary(
        name=name,
        metrics={
            "total_cases": metrics.total_cases,
            "keyword_hit_rate": metrics.keyword_hit_rate,
            "hit_rate_at_k": metrics.hit_rate_at_k,
            "mrr_at_k": metrics.mrr_at_k,
            "avg_latency_ms": metrics.avg_latency_ms,
            "failure_rate": metrics.failure_rate,
            "failed_case_ids": metrics.failed_case_ids,
        },
        latency=latency_summary(eval_results),
        rerank_coverage_rate=round(rerank_coverage_rate, 4),
    )


async def run_stratumind_case(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    case: dict[str, Any],
    top_k: int,
) -> SearchCaseResult:
    start = time.monotonic()
    try:
        response = await client.post(
            f"{base_url.rstrip('/')}/search/text",
            json={
                "project_id": case["project_id"],
                "query": case["query"],
                "top_k": top_k,
            },
        )
        latency_ms = (time.monotonic() - start) * 1000
        response.raise_for_status()
        payload = response.json()
        raw_results = payload.get("results") or []
        chunk_ids = [
            str(item.get("chunk_id") or "")
            for item in raw_results
            if str(item.get("chunk_id") or "")
        ]
        contents = [
            str(item.get("content") or "")
            for item in raw_results
            if str(item.get("content") or "")
        ]
        ranking_stages = [str(item.get("ranking_stage") or "") for item in raw_results]
        rerank_score_count = sum(
            1 for item in raw_results if item.get("rerank_score") is not None
        )
        base_score_count = sum(
            1 for item in raw_results if item.get("base_score") is not None
        )
        return SearchCaseResult(
            eval_result=EvalResult(
                case_id=case["id"],
                query=case["query"],
                retrieved_chunk_ids=chunk_ids,
                retrieved_contents=contents,
                latency_ms=latency_ms,
            ),
            ranking_stages=ranking_stages,
            rerank_score_count=rerank_score_count,
            base_score_count=base_score_count,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return SearchCaseResult(
            eval_result=EvalResult(
                case_id=case["id"],
                query=case["query"],
                retrieved_chunk_ids=[],
                retrieved_contents=[],
                latency_ms=latency_ms,
                error=str(exc),
            ),
            ranking_stages=[],
            rerank_score_count=0,
            base_score_count=0,
        )


async def run_dualweave_direct_case(
    client: httpx.AsyncClient,
    *,
    base_url: str,
    query: str,
    documents: list[str],
) -> dict[str, Any]:
    start = time.monotonic()
    try:
        response = await client.post(
            f"{base_url.rstrip('/')}/rerank/text",
            json={
                "query": query,
                "documents": documents,
                "top_n": len(documents),
                "return_documents": True,
            },
        )
        latency_ms = (time.monotonic() - start) * 1000
        response.raise_for_status()
        payload = response.json()
        return {
            "latency_ms": latency_ms,
            "provider": payload.get("provider"),
            "model": payload.get("model"),
            "results_count": len(payload.get("results") or []),
            "error": None,
        }
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return {
            "latency_ms": latency_ms,
            "provider": None,
            "model": None,
            "results_count": 0,
            "error": str(exc),
        }


def compare_top1_changes(
    baseline_results: list[SearchCaseResult],
    rerank_results: list[SearchCaseResult],
) -> list[dict[str, Any]]:
    baseline_map = {item.eval_result.case_id: item for item in baseline_results}
    rerank_map = {item.eval_result.case_id: item for item in rerank_results}
    rows: list[dict[str, Any]] = []
    for case_id in sorted(set(baseline_map) & set(rerank_map)):
        baseline_top1 = baseline_map[case_id].eval_result.retrieved_chunk_ids[:1]
        rerank_top1 = rerank_map[case_id].eval_result.retrieved_chunk_ids[:1]
        rows.append(
            {
                "case_id": case_id,
                "baseline_top1": baseline_top1[0] if baseline_top1 else None,
                "rerank_top1": rerank_top1[0] if rerank_top1 else None,
                "changed": baseline_top1 != rerank_top1,
            }
        )
    return rows


async def run_eval(
    *,
    project_id: str,
    dataset_path: Path,
    output_path: Path,
    top_k: int,
    baseline_stratumind_base_url: str,
    rerank_stratumind_base_url: str,
    dualweave_base_url: Optional[str],
) -> None:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = dataset["cases"]
    for case in cases:
        case.setdefault("project_id", project_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        baseline_results: list[SearchCaseResult] = []
        rerank_results: list[SearchCaseResult] = []
        dualweave_results: list[dict[str, Any]] = []

        for index, case in enumerate(cases, start=1):
            baseline = await run_stratumind_case(
                client,
                base_url=baseline_stratumind_base_url,
                case=case,
                top_k=top_k,
            )
            rerank = await run_stratumind_case(
                client,
                base_url=rerank_stratumind_base_url,
                case=case,
                top_k=top_k,
            )
            baseline_results.append(baseline)
            rerank_results.append(rerank)

            dualweave_probe = None
            if dualweave_base_url:
                dualweave_probe = await run_dualweave_direct_case(
                    client,
                    base_url=dualweave_base_url,
                    query=case["query"],
                    documents=baseline.eval_result.retrieved_contents,
                )
                dualweave_probe["case_id"] = case["id"]
                dualweave_results.append(dualweave_probe)

            print(
                f"[{index:2d}/{len(cases)}] {case['id']} "
                f"baseline={baseline.eval_result.latency_ms:.0f}ms "
                f"rerank={rerank.eval_result.latency_ms:.0f}ms"
            )
            if dualweave_probe is not None:
                print(
                    f"       dualweave={dualweave_probe['latency_ms']:.0f}ms "
                    f"error={dualweave_probe['error'] or '-'}"
                )

    baseline_summary = summarize_scenario("baseline", baseline_results, cases)
    rerank_summary = summarize_scenario("rerank", rerank_results, cases)
    top1_changes = compare_top1_changes(baseline_results, rerank_results)

    output: dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "tool_version": "stratumind-rerank-eval-v1",
        "project_id": project_id,
        "dataset_path": str(dataset_path),
        "dataset_version": dataset.get("version", "unknown"),
        "top_k": top_k,
        "scenarios": {
            "baseline": asdict(baseline_summary),
            "rerank": asdict(rerank_summary),
        },
        "comparison": {
            "keyword_hit_rate_delta": round(
                rerank_summary.metrics["keyword_hit_rate"]
                - baseline_summary.metrics["keyword_hit_rate"],
                4,
            ),
            "hit_rate_at_1_delta": round(
                rerank_summary.metrics["hit_rate_at_k"].get(1, 0.0)
                - baseline_summary.metrics["hit_rate_at_k"].get(1, 0.0),
                4,
            ),
            "mrr_at_5_delta": round(
                rerank_summary.metrics["mrr_at_k"].get(5, 0.0)
                - baseline_summary.metrics["mrr_at_k"].get(5, 0.0),
                4,
            ),
            "avg_latency_ms_delta": round(
                rerank_summary.metrics["avg_latency_ms"]
                - baseline_summary.metrics["avg_latency_ms"],
                2,
            ),
            "top1_changed_cases": [row for row in top1_changes if row["changed"]],
            "top1_change_rate": round(
                (
                    sum(1 for row in top1_changes if row["changed"]) / len(top1_changes)
                    if top1_changes
                    else 0.0
                ),
                4,
            ),
        },
        "cases": [
            {
                "case_id": baseline.eval_result.case_id,
                "query": baseline.eval_result.query,
                "baseline": {
                    "latency_ms": round(baseline.eval_result.latency_ms, 2),
                    "top1_chunk_id": (
                        baseline.eval_result.retrieved_chunk_ids[0]
                        if baseline.eval_result.retrieved_chunk_ids
                        else None
                    ),
                    "error": baseline.eval_result.error,
                },
                "rerank": {
                    "latency_ms": round(rerank.eval_result.latency_ms, 2),
                    "top1_chunk_id": (
                        rerank.eval_result.retrieved_chunk_ids[0]
                        if rerank.eval_result.retrieved_chunk_ids
                        else None
                    ),
                    "error": rerank.eval_result.error,
                    "rerank_score_count": rerank.rerank_score_count,
                    "base_score_count": rerank.base_score_count,
                    "ranking_stages": rerank.ranking_stages,
                },
            }
            for baseline, rerank in zip(baseline_results, rerank_results)
        ],
    }

    if dualweave_results:
        dualweave_latencies = [item["latency_ms"] for item in dualweave_results]
        dualweave_failures = [item for item in dualweave_results if item["error"]]
        output["dualweave_direct"] = {
            "avg_latency_ms": (
                round(statistics.mean(dualweave_latencies), 2)
                if dualweave_latencies
                else 0.0
            ),
            "p95_latency_ms": (
                round(percentile(dualweave_latencies, 0.95), 2)
                if dualweave_latencies
                else 0.0
            ),
            "failure_rate": (
                round(len(dualweave_failures) / len(dualweave_results), 4)
                if dualweave_results
                else 0.0
            ),
            "sample_count": len(dualweave_results),
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("\n=== Baseline ===")
    print_summary(baseline_summary)
    print("\n=== Rerank ===")
    print_summary(rerank_summary)
    print("\n=== Delta ===")
    print(json.dumps(output["comparison"], ensure_ascii=False, indent=2))
    if "dualweave_direct" in output:
        print("\n=== Dualweave Direct ===")
        print(json.dumps(output["dualweave_direct"], ensure_ascii=False, indent=2))
    print(f"\n结果已保存至: {output_path}")


def print_summary(summary: ScenarioSummary) -> None:
    print(json.dumps(asdict(summary), ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Stratumind rerank comparison eval")
    parser.add_argument("--project-id", required=True, help="目标项目 ID")
    parser.add_argument("--dataset", default="eval/dataset.json", help="评测数据集路径")
    parser.add_argument(
        "--output",
        default="eval/results/stratumind_rerank_eval.json",
        help="结果输出路径",
    )
    parser.add_argument("--top-k", type=int, default=5, help="检索 top_k")
    parser.add_argument(
        "--baseline-stratumind-base-url",
        required=True,
        help="baseline Stratumind base URL",
    )
    parser.add_argument(
        "--rerank-stratumind-base-url", required=True, help="rerank Stratumind base URL"
    )
    parser.add_argument(
        "--dualweave-base-url", default=None, help="可选，Dualweave base URL"
    )
    args = parser.parse_args()

    asyncio.run(
        run_eval(
            project_id=args.project_id,
            dataset_path=Path(args.dataset),
            output_path=Path(args.output),
            top_k=args.top_k,
            baseline_stratumind_base_url=args.baseline_stratumind_base_url,
            rerank_stratumind_base_url=args.rerank_stratumind_base_url,
            dualweave_base_url=args.dualweave_base_url,
        )
    )


if __name__ == "__main__":
    main()
