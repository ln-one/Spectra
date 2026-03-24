import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from routers.chat import message_flow
from services.rag_service import rag_service


@pytest.mark.asyncio
async def test_build_history_payload_uses_compact_recent_query(monkeypatch):
    recent_messages = [
        SimpleNamespace(role="user", content="U1"),
        SimpleNamespace(role="assistant", content="A1"),
    ]
    get_recent = AsyncMock(return_value=recent_messages)
    monkeypatch.setattr(
        message_flow.db_service,
        "get_recent_conversation_messages",
        get_recent,
    )

    payload = await message_flow.build_history_payload("proj-1", "sess-1")

    assert payload == [
        {"role": "user", "content": "U1"},
        {"role": "assistant", "content": "A1"},
    ]
    get_recent.assert_awaited_once_with(
        project_id="proj-1",
        limit=6,
        session_id="sess-1",
        select={"role": True, "content": True},
    )


@pytest.mark.asyncio
async def test_load_rag_context_keeps_rag_when_selected_upload_lookup_fails(
    monkeypatch,
):
    upload_find_many = AsyncMock(side_effect=RuntimeError("upload db unavailable"))
    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(upload=SimpleNamespace(find_many=upload_find_many)),
    )
    rag_item = SimpleNamespace(
        content="牛顿第二定律",
        score=0.9,
        source=SimpleNamespace(
            chunk_id="chunk-1",
            source_type="document",
            filename="physics.pdf",
            page_number=1,
        ),
    )
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[rag_item]))

    rag_results, citations, rag_hit, selected_files_hint, rag_payload, rag_failure = (
        await message_flow.load_rag_context(
            project_id="proj-1",
            query="牛顿第二定律",
            session_id="sess-1",
            rag_source_ids=["f-1"],
        )
    )

    assert rag_hit is True
    assert selected_files_hint == ""
    assert len(rag_results) == 1
    assert len(citations) == 1
    assert citations[0]["chunk_id"] == "chunk-1"
    assert rag_payload and rag_payload[0]["content"] == "牛顿第二定律"
    assert rag_failure is None


@pytest.mark.asyncio
async def test_load_rag_context_falls_back_when_upload_select_not_supported(
    monkeypatch,
):
    upload_calls = []

    async def _find_many(**kwargs):
        upload_calls.append(kwargs)
        if "select" in kwargs:
            raise TypeError(
                "UploadActions.find_many() got an unexpected keyword argument 'select'"
            )
        return [SimpleNamespace(filename="physics.pdf", status="indexed")]

    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(
            upload=SimpleNamespace(find_many=AsyncMock(side_effect=_find_many))
        ),
    )
    rag_item = SimpleNamespace(
        content="牛顿第二定律",
        score=0.9,
        source=SimpleNamespace(
            chunk_id="chunk-1",
            source_type="document",
            filename="physics.pdf",
            page_number=1,
        ),
    )
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[rag_item]))

    rag_results, _, rag_hit, selected_files_hint, _, rag_failure = (
        await message_flow.load_rag_context(
            project_id="proj-1",
            query="牛顿第二定律",
            session_id="sess-1",
            rag_source_ids=["f-1"],
        )
    )

    assert rag_hit is True
    assert len(rag_results) == 1
    assert "physics.pdf(indexed)" in selected_files_hint
    assert len(upload_calls) == 2
    assert "select" in upload_calls[0]
    assert "select" not in upload_calls[1]
    assert rag_failure is None


@pytest.mark.asyncio
async def test_load_rag_context_times_out_and_degrades(monkeypatch):
    monkeypatch.setenv("CHAT_RAG_TIMEOUT_SECONDS", "0.01")
    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(upload=SimpleNamespace(find_many=AsyncMock(return_value=[]))),
    )

    async def _slow_search(*args, **kwargs):
        await asyncio.sleep(0.05)
        return [
            SimpleNamespace(
                content="slow",
                score=0.9,
                source=SimpleNamespace(
                    chunk_id="chunk-1",
                    source_type="document",
                    filename="slow.pdf",
                    page_number=1,
                ),
            )
        ]

    monkeypatch.setattr(rag_service, "search", _slow_search)

    rag_results, citations, rag_hit, selected_files_hint, rag_payload, rag_failure = (
        await message_flow.load_rag_context(
            project_id="proj-1",
            query="slow query",
            session_id="sess-1",
            rag_source_ids=None,
        )
    )

    assert rag_results == []
    assert citations == []
    assert rag_hit is False
    assert selected_files_hint == ""
    assert rag_payload is None
    assert rag_failure == "rag_timeout"
