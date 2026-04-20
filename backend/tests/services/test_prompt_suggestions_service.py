from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.rag import (
    PromptSuggestionRequest,
    PromptSuggestionStatus,
    PromptSuggestionSurface,
    RAGResult,
    SourceReference,
)
from services.ai import ai_service
from services.prompt_suggestion_pool import generation as generation_module
from services.prompt_suggestion_pool import service as pool_service
from services.rag_api_service import access as rag_access
from utils.exceptions import APIException


def _cache(**overrides):
    payload = {
        "status": PromptSuggestionStatus.READY.value,
        "suggestionsJson": (
            '["制作一份 12 页均衡型 PPT，围绕函数图像平移与伸缩展开，'
            '采用清爽学术图解风格，突出变换规律。","制作一份 8 页简洁型 PPT，'
            '讲解函数图像对称变化，采用现代信息图风格，突出对比案例。"]'
        ),
        "summary": "聚焦函数图像变化的 PPT 生成方向。",
        "sourceFingerprint": "fp-1",
        "generatedAt": datetime.now(timezone.utc),
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def _rag_result() -> RAGResult:
    return RAGResult(
        chunk_id="chunk-1",
        content="函数图像变化可以通过平移、伸缩和对称来组织课堂讲解。",
        score=0.86,
        source=SourceReference(
            chunk_id="chunk-1",
            source_type="document",
            filename="math.pdf",
        ),
    )


@pytest.mark.asyncio
async def test_prompt_suggestion_pool_reads_tool_scoped_cache(monkeypatch):
    monkeypatch.setattr(rag_access, "ensure_project_access", AsyncMock())
    get_cache = AsyncMock(return_value=_cache())
    enqueue = AsyncMock()
    monkeypatch.setattr(
        pool_service,
        "build_project_source_fingerprint",
        AsyncMock(return_value=("fp-1", 2)),
    )
    monkeypatch.setattr(pool_service, "get_cache", get_cache)
    monkeypatch.setattr(
        pool_service,
        "enqueue_project_prompt_suggestion_refresh",
        enqueue,
    )

    response = await pool_service.prompt_suggestions_pool_response(
        PromptSuggestionRequest(
            project_id="p-1",
            surface=PromptSuggestionSurface.PPT_GENERATION_CONFIG,
            limit=1,
        ),
        user_id="u-1",
    )

    assert response["data"]["status"] == "ready"
    assert response["data"]["pool_size"] == 2
    assert response["data"]["suggestions"][0].startswith("制作一份 12 页")
    assert get_cache.await_args.args[2] == PromptSuggestionSurface.PPT_GENERATION_CONFIG
    assert enqueue.call_count == 0


@pytest.mark.asyncio
async def test_prompt_suggestion_pool_miss_returns_generating_and_enqueues(
    monkeypatch,
):
    monkeypatch.setattr(rag_access, "ensure_project_access", AsyncMock())
    mark_generating = AsyncMock()
    enqueued = []
    monkeypatch.setattr(
        pool_service,
        "build_project_source_fingerprint",
        AsyncMock(return_value=("fp-new", 2)),
    )
    monkeypatch.setattr(pool_service, "get_cache", AsyncMock(return_value=None))
    monkeypatch.setattr(pool_service, "mark_generating", mark_generating)
    monkeypatch.setattr(
        pool_service,
        "enqueue_project_prompt_suggestion_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    response = await pool_service.prompt_suggestions_pool_response(
        PromptSuggestionRequest(
            project_id="p-1",
            surface=PromptSuggestionSurface.STUDIO_GAME,
        ),
        user_id="u-1",
        task_queue_service=object(),
    )

    assert response["data"]["status"] == "generating"
    assert response["data"]["suggestions"] == []
    assert mark_generating.await_count == 1
    assert PromptSuggestionSurface.STUDIO_GAME in enqueued[0]["surfaces"]
    assert PromptSuggestionSurface.PPT_GENERATION_CONFIG in enqueued[0]["surfaces"]


@pytest.mark.asyncio
async def test_prompt_suggestion_pool_stale_cache_returns_old_pool_and_refreshes(
    monkeypatch,
):
    monkeypatch.setattr(rag_access, "ensure_project_access", AsyncMock())
    mark_generating = AsyncMock()
    enqueued = []
    monkeypatch.setattr(
        pool_service,
        "build_project_source_fingerprint",
        AsyncMock(return_value=("fp-new", 2)),
    )
    monkeypatch.setattr(
        pool_service,
        "get_cache",
        AsyncMock(return_value=_cache(sourceFingerprint="fp-old")),
    )
    monkeypatch.setattr(pool_service, "mark_generating", mark_generating)
    monkeypatch.setattr(
        pool_service,
        "enqueue_project_prompt_suggestion_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    response = await pool_service.prompt_suggestions_pool_response(
        PromptSuggestionRequest(
            project_id="p-1",
            surface=PromptSuggestionSurface.PPT_GENERATION_CONFIG,
        ),
        user_id="u-1",
        task_queue_service=object(),
    )

    assert response["data"]["status"] == "stale"
    assert response["data"]["suggestions"]
    assert mark_generating.await_count == 1
    assert enqueued


@pytest.mark.asyncio
async def test_prompt_suggestion_pool_rejects_file_filters(monkeypatch):
    monkeypatch.setattr(rag_access, "ensure_project_access", AsyncMock())

    with pytest.raises(APIException) as exc_info:
        await pool_service.prompt_suggestions_pool_response(
            PromptSuggestionRequest(
                project_id="p-1",
                surface=PromptSuggestionSurface.STUDIO_QUIZ,
                filters={"file_ids": ["f-1"]},
            ),
            user_id="u-1",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.details["reason"] == "prompt_suggestion_pool_is_project_scoped"


@pytest.mark.asyncio
async def test_generate_ppt_pool_keeps_only_complete_ppt_prompts(monkeypatch):
    saved = []
    monkeypatch.setattr(
        generation_module,
        "build_project_source_fingerprint",
        AsyncMock(return_value=("fp-1", 1)),
    )
    monkeypatch.setattr(
        generation_module.rag_service,
        "search",
        AsyncMock(return_value=[_rag_result()]),
    )
    monkeypatch.setattr(
        ai_service,
        "generate",
        AsyncMock(
            return_value={
                "content": (
                    '{"suggestions":["制作一份 12 页均衡型 PPT，围绕函数图像平移'
                    '与伸缩展开，采用清爽学术图解风格，突出变换规律。",'
                    '"函数图像平移与伸缩"],"summary":"PPT 生成方向"}'
                )
            }
        ),
    )
    monkeypatch.setattr(
        generation_module,
        "upsert_cache",
        AsyncMock(side_effect=lambda *args: saved.append(args[3])),
    )

    suggestions = await generation_module.generate_prompt_suggestion_pool(
        project_id="p-1",
        surface=PromptSuggestionSurface.PPT_GENERATION_CONFIG,
        source_fingerprint="fp-1",
        db=object(),
    )

    assert suggestions == [
        "制作一份 12 页均衡型 PPT，围绕函数图像平移与伸缩展开，采用清爽学术图解风格，突出变换规律。"
    ]
    assert saved[-1]["status"] == "ready"
