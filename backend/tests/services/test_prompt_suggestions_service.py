from unittest.mock import AsyncMock

import pytest

from schemas.rag import (
    PromptSuggestionRequest,
    PromptSuggestionSurface,
    RAGResult,
    SourceReference,
)
from services.rag_api_service import prompt_suggestions as prompt_suggestion_module
from services.ai import ai_service
from utils.exceptions import APIException, ErrorCode, ExternalServiceException


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
async def test_prompt_suggestions_use_rag_and_llm(monkeypatch):
    monkeypatch.setattr(
        prompt_suggestion_module,
        "ensure_project_access",
        AsyncMock(return_value=None),
    )
    search_mock = AsyncMock(return_value=[_rag_result()])
    generate_mock = AsyncMock(
        return_value={
            "content": '{"suggestions":["围绕函数图像平移设计一组对比讲解"],"summary":"聚焦函数图像变化规律。"}'
        }
    )
    monkeypatch.setattr(prompt_suggestion_module.rag_service, "search", search_mock)
    monkeypatch.setattr(ai_service, "generate", generate_mock)

    response = await prompt_suggestion_module.prompt_suggestions_response(
        PromptSuggestionRequest(
            project_id="p-1",
            surface=PromptSuggestionSurface.PPT_GENERATION_CONFIG,
            seed_text="函数图像",
            limit=3,
        ),
        user_id="u-1",
    )

    assert response["data"]["rag_hit"] is True
    assert response["data"]["suggestions"] == [
        "围绕函数图像平移设计一组对比讲解"
    ]
    assert response["data"]["summary"] == "聚焦函数图像变化规律。"
    assert "函数图像" in search_mock.await_args.kwargs["query"]
    assert generate_mock.await_args.kwargs["has_rag_context"] is True


@pytest.mark.asyncio
async def test_prompt_suggestions_fail_explicitly_without_rag(monkeypatch):
    monkeypatch.setattr(
        prompt_suggestion_module,
        "ensure_project_access",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        prompt_suggestion_module.rag_service,
        "search",
        AsyncMock(return_value=[]),
    )

    with pytest.raises(APIException) as exc_info:
        await prompt_suggestion_module.prompt_suggestions_response(
            PromptSuggestionRequest(
                project_id="p-1",
                surface=PromptSuggestionSurface.STUDIO_QUIZ,
            ),
            user_id="u-1",
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.details["reason"] == "insufficient_rag_context"


@pytest.mark.asyncio
async def test_prompt_suggestions_fail_explicitly_on_invalid_model_json(monkeypatch):
    monkeypatch.setattr(
        prompt_suggestion_module,
        "ensure_project_access",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        prompt_suggestion_module.rag_service,
        "search",
        AsyncMock(return_value=[_rag_result()]),
    )
    monkeypatch.setattr(
        ai_service,
        "generate",
        AsyncMock(return_value={"content": "not json"}),
    )

    with pytest.raises(ExternalServiceException) as exc_info:
        await prompt_suggestion_module.prompt_suggestions_response(
            PromptSuggestionRequest(
                project_id="p-1",
                surface=PromptSuggestionSurface.STUDIO_GAME,
            ),
            user_id="u-1",
        )

    assert exc_info.value.status_code == 502
    assert exc_info.value.details["reason"] == "prompt_suggestion_generation_failed"


@pytest.mark.asyncio
async def test_prompt_suggestions_preserve_upstream_failure_with_tool_reason(
    monkeypatch,
):
    monkeypatch.setattr(
        prompt_suggestion_module,
        "ensure_project_access",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        prompt_suggestion_module.rag_service,
        "search",
        AsyncMock(return_value=[_rag_result()]),
    )
    monkeypatch.setattr(
        ai_service,
        "generate",
        AsyncMock(
            side_effect=ExternalServiceException(
                message="timeout",
                status_code=504,
                error_code=ErrorCode.UPSTREAM_TIMEOUT,
                details={"failure_type": "timeout"},
                retryable=True,
            )
        ),
    )

    with pytest.raises(ExternalServiceException) as exc_info:
        await prompt_suggestion_module.prompt_suggestions_response(
            PromptSuggestionRequest(
                project_id="p-1",
                surface=PromptSuggestionSurface.STUDIO_WORD,
            ),
            user_id="u-1",
        )

    assert exc_info.value.status_code == 504
    assert exc_info.value.error_code == ErrorCode.UPSTREAM_TIMEOUT
    assert exc_info.value.details["reason"] == "prompt_suggestion_generation_failed"
    assert exc_info.value.details["upstream"]["failure_type"] == "timeout"
