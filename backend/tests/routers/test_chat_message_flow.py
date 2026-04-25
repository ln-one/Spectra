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
async def test_load_rag_context_keeps_rag_when_selected_upload_query_rejects_select(
    monkeypatch,
):
    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(
            upload=SimpleNamespace(
                find_many=AsyncMock(
                    side_effect=TypeError(
                        "UploadActions.find_many() got an unexpected keyword argument 'select'"
                    )
                )
            )
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
    assert selected_files_hint == ""
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


@pytest.mark.asyncio
async def test_load_rag_context_marks_source_not_found_for_unknown_selected_ids(
    monkeypatch,
):
    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(upload=SimpleNamespace(find_many=AsyncMock(return_value=[]))),
    )
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[]))

    _, _, rag_hit, selected_files_hint, _, rag_failure = (
        await message_flow.load_rag_context(
            project_id="proj-1",
            query="query",
            session_id="sess-1",
            rag_source_ids=["f-missing"],
        )
    )

    assert rag_hit is False
    assert selected_files_hint == ""
    assert rag_failure == "source_not_found"


@pytest.mark.asyncio
async def test_load_rag_context_marks_source_not_ready_when_selected_upload_pending(
    monkeypatch,
):
    monkeypatch.setattr(
        message_flow.db_service,
        "db",
        SimpleNamespace(
            upload=SimpleNamespace(
                find_many=AsyncMock(
                    return_value=[
                        SimpleNamespace(
                            id="f-1",
                            filename="pending.pdf",
                            status="parsing",
                        )
                    ]
                )
            )
        ),
    )
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[]))

    _, _, rag_hit, selected_files_hint, _, rag_failure = (
        await message_flow.load_rag_context(
            project_id="proj-1",
            query="query",
            session_id="sess-1",
            rag_source_ids=["f-1"],
        )
    )

    assert rag_hit is False
    assert "pending.pdf(parsing)" in selected_files_hint
    assert rag_failure == "source_not_ready"


@pytest.mark.asyncio
async def test_load_rag_context_marks_rag_no_match_when_retrieval_empty_without_error(
    monkeypatch,
):
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[]))

    _, _, rag_hit, _, rag_payload, rag_failure = await message_flow.load_rag_context(
        project_id="proj-1",
        query="query",
        session_id="sess-1",
        rag_source_ids=None,
    )

    assert rag_hit is False
    assert rag_payload is None
    assert rag_failure == "rag_no_match"


@pytest.mark.asyncio
async def test_load_rag_context_citations_keep_attached_library_metadata(monkeypatch):
    rag_item = SimpleNamespace(
        content="来自资料库的内容",
        score=0.88,
        source=SimpleNamespace(
            chunk_id="chunk-lib-1",
            source_type="document",
            filename="library.pdf",
            page_number=2,
        ),
        metadata={
            "source_scope": "attached_library",
            "source_library_id": "lib-1",
            "source_library_name": "物理资料库",
        },
    )
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[rag_item]))

    _, citations, rag_hit, _, rag_payload, rag_failure = await message_flow.load_rag_context(
        project_id="proj-1",
        query="牛顿第二定律",
        session_id="sess-1",
        rag_source_ids=None,
        selected_library_ids=["lib-1"],
    )

    assert rag_hit is True
    assert rag_failure is None
    assert citations[0]["source_scope"] == "attached_library"
    assert citations[0]["source_library_id"] == "lib-1"
    assert citations[0]["source_library_name"] == "物理资料库"
    assert rag_payload and rag_payload[0]["content"] == "来自资料库的内容"


@pytest.mark.asyncio
async def test_load_rag_context_skips_local_project_when_selected_files_empty(
    monkeypatch,
):
    monkeypatch.setattr(rag_service, "search", AsyncMock(return_value=[]))

    await message_flow.load_rag_context(
        project_id="proj-1",
        query="query",
        session_id="sess-1",
        rag_source_ids=[],
        selected_library_ids=[],
        search_local_project=False,
    )

    rag_service.search.assert_awaited_once_with(
        project_id="proj-1",
        query="query",
        top_k=5,
        score_threshold=0.3,
        session_id="sess-1",
        filters=None,
        selected_library_ids=[],
        search_local_project=False,
    )
