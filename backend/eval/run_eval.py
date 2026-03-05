"""
RAG 评测脚本

用法：
    cd backend
    venv/Scripts/python.exe eval/run_eval.py --project-id <project_id> [options]

选项：
    --project-id    必填，目标项目 ID
    --dataset       评测数据集路径（默认 eval/dataset.json）
    --top-k         检索 top_k（默认 5）
    --output        结果输出路径（默认 eval/results/latest.json）
    --baseline      基线结果路径，用于对比（可选）
"""

import argparse
import asyncio
import hashlib
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# 将 backend 目录加入 sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from eval.metrics import EvalResult, compute_metrics  # noqa: E402


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


async def run_single_case(
    rag_service,
    case: dict,
    top_k: int,
) -> EvalResult:
    """执行单条评测用例"""
    start = time.monotonic()
    try:
        results = await rag_service.search(
            project_id=case["project_id"],
            query=case["query"],
            top_k=top_k,
        )
        latency_ms = (time.monotonic() - start) * 1000
        return EvalResult(
            case_id=case["id"],
            query=case["query"],
            retrieved_chunk_ids=[r.chunk_id for r in results],
            retrieved_contents=[r.content for r in results],
            latency_ms=latency_ms,
        )
    except Exception as e:
        latency_ms = (time.monotonic() - start) * 1000
        return EvalResult(
            case_id=case["id"],
            query=case["query"],
            retrieved_chunk_ids=[],
            retrieved_contents=[],
            latency_ms=latency_ms,
            error=str(e),
        )


async def run_eval(
    project_id: str,
    dataset_path: Path,
    top_k: int,
    output_path: Path,
    baseline_path: Path | None,
    run_tag: str | None = None,
) -> None:
    from services.rag_service import rag_service

    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = dataset["cases"]

    # 注入 project_id（数据集中可能没有）
    for case in cases:
        case.setdefault("project_id", project_id)

    print(f"开始评测：{len(cases)} 条用例，top_k={top_k}")
    print("-" * 50)

    eval_results: list[EvalResult] = []
    for i, case in enumerate(cases, 1):
        result = await run_single_case(rag_service, case, top_k)
        status = "✗ FAIL" if result.failed else f"✓ {result.latency_ms:.0f}ms"
        print(f"[{i:2d}/{len(cases)}] {case['id']} {status}")
        if result.error:
            print(f"       错误: {result.error}")
        eval_results.append(result)

    metrics = compute_metrics(eval_results, cases)

    print("\n" + "=" * 50)
    print("评测结果")
    print("=" * 50)
    print(metrics.summary())

    # 与基线对比
    if baseline_path and baseline_path.exists():
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        baseline_kw = baseline.get("metrics", {}).get("keyword_hit_rate", 0)
        delta = metrics.keyword_hit_rate - baseline_kw
        sign = "+" if delta >= 0 else ""
        print(f"\n与基线对比（关键词命中率）: {sign}{delta:.1%}")

    # 保存结果
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "timestamp": datetime.now().isoformat(),
        "tool_version": "rag-eval-v1",
        "project_id": project_id,
        "python_version": sys.version.split()[0],
        "dataset_version": dataset.get("version", "unknown"),
        "dataset_path": str(dataset_path),
        "dataset_sha256": _sha256_file(dataset_path),
        "top_k": top_k,
        "run_tag": run_tag,
        "metrics": {
            "keyword_hit_rate": metrics.keyword_hit_rate,
            "hit_rate_at_k": metrics.hit_rate_at_k,
            "mrr_at_k": metrics.mrr_at_k,
            "avg_latency_ms": metrics.avg_latency_ms,
            "failure_rate": metrics.failure_rate,
            "failed_case_ids": metrics.failed_case_ids,
        },
        "cases": [
            {
                "id": r.case_id,
                "query": r.query,
                "latency_ms": round(r.latency_ms, 2),
                "retrieved_count": len(r.retrieved_chunk_ids),
                "error": r.error,
            }
            for r in eval_results
        ],
    }
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n结果已保存至: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RAG 评测脚本")
    parser.add_argument("--project-id", required=True, help="目标项目 ID")
    parser.add_argument(
        "--dataset",
        default="eval/dataset.json",
        help="评测数据集路径（默认 eval/dataset.json）",
    )
    parser.add_argument("--top-k", type=int, default=5, help="检索 top_k（默认 5）")
    parser.add_argument(
        "--output",
        default="eval/results/latest.json",
        help="结果输出路径",
    )
    parser.add_argument("--baseline", default=None, help="基线结果路径（可选）")
    parser.add_argument("--tag", default=None, help="运行标签（可选）")
    args = parser.parse_args()

    asyncio.run(
        run_eval(
            project_id=args.project_id,
            dataset_path=Path(args.dataset),
            top_k=args.top_k,
            output_path=Path(args.output),
            baseline_path=Path(args.baseline) if args.baseline else None,
            run_tag=args.tag,
        )
    )


if __name__ == "__main__":
    main()
