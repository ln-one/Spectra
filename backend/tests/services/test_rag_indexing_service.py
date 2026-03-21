"""Unit tests for RAG indexing pipeline helper."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.media import rag_indexing as rag_indexing_service


def _fake_upload(**kw):
    data = dict(
        id="u-001",
        filename="notes.txt",
        filepath="uploads/notes.txt",
        fileType="word",
    )
    data.update(kw)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_success(monkeypatch):
    upload = _fake_upload()
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type: (
            "line one\nline two",
            {"text_length": 16, "pages": 1},
        ),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: ["line one", "line two"],
    )
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        AsyncMock(
            return_value=[
                SimpleNamespace(id="chunk-1"),
                SimpleNamespace(id="chunk-2"),
            ]
        ),
    )
    index_mock = AsyncMock(return_value=2)
    monkeypatch.setattr(rag_indexing_service.rag_service, "index_chunks", index_mock)

    result = await rag_indexing_service.index_upload_file_for_rag(upload, "p-001")

    assert result["chunk_count"] == 2
    assert result["indexed_count"] == 2
    assert result["pages"] == 1
    assert result["provider"] == "unknown"
    assert result["fallback_used"] is False
    assert "parse_ms" in result["stage_timings_ms"]
    assert "embedding_ms" in result["stage_timings_ms"]
    index_mock.assert_awaited_once()
    rag_chunks = index_mock.await_args.args[1]
    assert rag_chunks[0].metadata["upload_id"] == "u-001"
    assert rag_chunks[0].metadata["filename"] == "notes.txt"


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_with_session_id(monkeypatch):
    upload = _fake_upload()
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type: ("line one", {"text_length": 8}),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: ["line one"],
    )
    create_chunks_mock = AsyncMock(return_value=[SimpleNamespace(id="chunk-1")])
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        create_chunks_mock,
    )
    index_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(rag_indexing_service.rag_service, "index_chunks", index_mock)

    await rag_indexing_service.index_upload_file_for_rag(
        upload=upload,
        project_id="p-001",
        session_id="s-001",
    )

    chunks_arg = create_chunks_mock.await_args.kwargs["chunks"]
    assert chunks_arg[0]["metadata"]["session_id"] == "s-001"
    rag_chunks = index_mock.await_args.args[1]
    assert rag_chunks[0].metadata["session_id"] == "s-001"


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_parse_error_fallback(monkeypatch):
    upload = _fake_upload(filename="broken.pdf", fileType="pdf")

    def _raise_parse_error(filepath, filename, file_type):
        raise RuntimeError("parse failed")

    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        _raise_parse_error,
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: [],
    )
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        AsyncMock(return_value=[SimpleNamespace(id="chunk-fallback")]),
    )
    monkeypatch.setattr(
        rag_indexing_service.rag_service,
        "index_chunks",
        AsyncMock(return_value=1),
    )

    result = await rag_indexing_service.index_upload_file_for_rag(upload, "p-001")

    assert result["fallback"] is True
    assert result["chunk_count"] == 1
    assert result["indexed_count"] == 1
    assert result["fallback_used"] is True
    assert result["text_length"] > 0
    assert result["error"] == "parse failed"


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_reindex_deletes_old_data(monkeypatch):
    upload = _fake_upload()
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type: ("content", {"text_length": 7}),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: ["content"],
    )
    delete_index_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(
        rag_indexing_service.rag_service,
        "delete_upload_index",
        delete_index_mock,
    )
    delete_chunks_mock = AsyncMock(return_value=1)
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "delete_parsed_chunks",
        delete_chunks_mock,
    )
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        AsyncMock(return_value=[SimpleNamespace(id="chunk-1")]),
    )
    monkeypatch.setattr(
        rag_indexing_service.rag_service,
        "index_chunks",
        AsyncMock(return_value=1),
    )

    result = await rag_indexing_service.index_upload_file_for_rag(
        upload=upload,
        project_id="p-001",
        reindex=True,
    )

    assert result["chunk_count"] == 1
    delete_index_mock.assert_awaited_once_with(project_id="p-001", upload_id="u-001")
    delete_chunks_mock.assert_awaited_once_with("u-001")
