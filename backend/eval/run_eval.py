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
    --api-base-url  可选，走后端 API 模式（如 http://127.0.0.1:8000/api/v1）
    --api-token     API 模式下可选，Bearer Token
    --api-email     API 模式下可选，未提供 token 时用 email/password 注册/登录
    --api-password  API 模式下可选，未提供 token 时与 --api-email 配合
    --api-username  API 模式下可选，注册时使用（默认 eval_runner_<timestamp>）
"""

import argparse
import asyncio
import hashlib
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# 将 backend 目录加入 sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx  # noqa: E402

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


def _parse_json_safely(resp: httpx.Response) -> dict[str, Any]:
    try:
        payload = resp.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _short_body(resp: httpx.Response, limit: int = 200) -> str:
    text = (resp.text or "").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


async def _post_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    retries: int = 3,
    backoff_seconds: float = 0.8,
    **kwargs,
) -> httpx.Response:
    last_exc: Exception | None = None
    for i in range(retries):
        try:
            return await client.post(url, **kwargs)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if i == retries - 1:
                break
            await asyncio.sleep(backoff_seconds * (i + 1))
    raise RuntimeError(f"POST 请求失败: url={url}, error={last_exc}")


async def _resolve_api_token(
    client: httpx.AsyncClient,
    api_base_url: str,
    token: str | None,
    email: str | None,
    password: str | None,
    username: str | None,
) -> str:
    if token:
        return token

    if not email or not password:
        raise ValueError(
            "API 模式需提供 --api-token，或提供 --api-email + --api-password。"
        )

    register_payload = {
        "email": email,
        "password": password,
        "username": username or f"eval_runner_{int(time.time())}",
        "fullName": "D5 Eval Runner",
    }
    register = await _post_with_retry(
        client,
        f"{api_base_url}/auth/register",
        json=register_payload,
    )
    if 200 <= register.status_code < 300:
        data = _parse_json_safely(register).get("data", {})
        resolved = data.get("access_token")
        if resolved:
            return resolved
        raise RuntimeError("register 成功但响应缺少 access_token")

    login = await _post_with_retry(
        client,
        f"{api_base_url}/auth/login",
        json={"email": email, "password": password},
    )
    if not (200 <= login.status_code < 300):
        raise RuntimeError(
            "register/login 均失败: "
            f"register_status={register.status_code}, "
            f"register_body={_short_body(register)}; "
            f"login_status={login.status_code}, login_body={_short_body(login)}"
        )

    data = _parse_json_safely(login).get("data", {})
    resolved = data.get("access_token")
    if not resolved:
        raise RuntimeError("login 成功但响应缺少 access_token")
    return resolved


async def run_single_case_via_api(
    client: httpx.AsyncClient,
    api_base_url: str,
    token: str,
    case: dict,
    top_k: int,
) -> EvalResult:
    """通过后端 API 执行单条评测用例，避免本地模型环境差异。"""
    start = time.monotonic()
    try:
        resp = await _post_with_retry(
            client,
            f"{api_base_url}/rag/search",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "project_id": case["project_id"],
                "query": case["query"],
                "top_k": top_k,
            },
        )
        latency_ms = (time.monotonic() - start) * 1000
        if not (200 <= resp.status_code < 300):
            return EvalResult(
                case_id=case["id"],
                query=case["query"],
                retrieved_chunk_ids=[],
                retrieved_contents=[],
                latency_ms=latency_ms,
                error=f"HTTP {resp.status_code}: {_short_body(resp)}",
            )

        payload = _parse_json_safely(resp)
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        raw_results = data.get("results", []) if isinstance(data, dict) else []

        chunk_ids: list[str] = []
        contents: list[str] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            cid = item.get("chunk_id")
            content = item.get("content")
            if isinstance(cid, str) and cid:
                chunk_ids.append(cid)
            if isinstance(content, str) and content:
                contents.append(content)

        return EvalResult(
            case_id=case["id"],
            query=case["query"],
            retrieved_chunk_ids=chunk_ids,
            retrieved_contents=contents,
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
    api_base_url: str | None = None,
    api_token: str | None = None,
    api_email: str | None = None,
    api_password: str | None = None,
    api_username: str | None = None,
) -> None:
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = dataset["cases"]

    # 注入 project_id（数据集中可能没有）
    for case in cases:
        case.setdefault("project_id", project_id)

    print(f"开始评测：{len(cases)} 条用例，top_k={top_k}")
    print("-" * 50)

    eval_results: list[EvalResult] = []
    if api_base_url:
        normalized_base = api_base_url.rstrip("/")
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await _resolve_api_token(
                client=client,
                api_base_url=normalized_base,
                token=api_token,
                email=api_email,
                password=api_password,
                username=api_username,
            )
            for i, case in enumerate(cases, 1):
                result = await run_single_case_via_api(
                    client=client,
                    api_base_url=normalized_base,
                    token=token,
                    case=case,
                    top_k=top_k,
                )
                status = "FAIL" if result.failed else f"OK {result.latency_ms:.0f}ms"
                print(f"[{i:2d}/{len(cases)}] {case['id']} {status}")
                if result.error:
                    print(f"       错误: {result.error}")
                eval_results.append(result)
    else:
        from services.rag_service import rag_service

        for i, case in enumerate(cases, 1):
            result = await run_single_case(rag_service, case, top_k)
            status = "FAIL" if result.failed else f"OK {result.latency_ms:.0f}ms"
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
    parser.add_argument(
        "--api-base-url",
        default=None,
        help="后端 API 基地址（可选），例如 http://127.0.0.1:8000/api/v1",
    )
    parser.add_argument(
        "--api-token",
        default=None,
        help="API Bearer Token（可选，提供后不再自动注册/登录）",
    )
    parser.add_argument(
        "--api-email",
        default=None,
        help="API 模式邮箱（未提供 token 时用于注册/登录）",
    )
    parser.add_argument(
        "--api-password",
        default=None,
        help="API 模式密码（未提供 token 时与 --api-email 配合）",
    )
    parser.add_argument(
        "--api-username",
        default=None,
        help="API 模式注册用户名（可选）",
    )
    args = parser.parse_args()

    asyncio.run(
        run_eval(
            project_id=args.project_id,
            dataset_path=Path(args.dataset),
            top_k=args.top_k,
            output_path=Path(args.output),
            baseline_path=Path(args.baseline) if args.baseline else None,
            run_tag=args.tag,
            api_base_url=args.api_base_url,
            api_token=args.api_token,
            api_email=args.api_email,
            api_password=args.api_password,
            api_username=args.api_username,
        )
    )


if __name__ == "__main__":
    main()
