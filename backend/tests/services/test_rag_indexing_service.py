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
        lambda filepath, filename, file_type, parser_override=None: (
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
        lambda filepath, filename, file_type, parser_override=None: (
            "line one",
            {"text_length": 8},
        ),
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

    def _raise_parse_error(filepath, filename, file_type, parser_override=None):
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
async def test_index_upload_file_for_rag_short_circuits_deferred_parse(monkeypatch):
    upload = _fake_upload(filename="remote.pdf", fileType="pdf")
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type, parser_override=None: (
            "",
            {
                "deferred_parse": True,
                "provider_used": "dualweave_mineru",
                "dualweave": {"upload_id": "upl-123", "status": "pending_remote"},
            },
        ),
    )
    create_chunks_mock = AsyncMock()
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        create_chunks_mock,
    )
    index_mock = AsyncMock()
    monkeypatch.setattr(rag_indexing_service.rag_service, "index_chunks", index_mock)

    result = await rag_indexing_service.index_upload_file_for_rag(upload, "p-001")

    assert result["deferred_parse"] is True
    assert result["chunk_count"] == 0
    assert result["indexed_count"] == 0
    create_chunks_mock.assert_not_called()
    index_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_reindex_deletes_old_data(monkeypatch):
    upload = _fake_upload()
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type, parser_override=None: (
            "content",
            {"text_length": 7},
        ),
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


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_sanitizes_nul_bytes(monkeypatch):
    upload = _fake_upload(filename="bad.pdf", fileType="pdf")
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type, parser_override=None: (
            "valid\x00content\x00line",
            {"text_length": 18},
        ),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: [text],
    )
    create_chunks_mock = AsyncMock(return_value=[SimpleNamespace(id="chunk-1")])
    monkeypatch.setattr(
        rag_indexing_service.db_service,
        "create_parsed_chunks",
        create_chunks_mock,
    )
    monkeypatch.setattr(
        rag_indexing_service.rag_service,
        "index_chunks",
        AsyncMock(return_value=1),
    )

    result = await rag_indexing_service.index_upload_file_for_rag(upload, "p-001")

    assert result["chunk_count"] == 1
    chunks_arg = create_chunks_mock.await_args.kwargs["chunks"]
    assert "\x00" not in chunks_arg[0]["content"]


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_sets_fallback_used_from_capability_status(
    monkeypatch,
):
    upload = _fake_upload(filename="fallback.pdf", fileType="pdf")
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type, parser_override=None: (
            "fallback content",
            {
                "text_length": 16,
                "capability_status": {
                    "capability": "document_parser",
                    "provider": "local",
                    "status": "degraded",
                    "fallback_used": True,
                    "fallback_target": "local",
                },
            },
        ),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: [text],
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

    result = await rag_indexing_service.index_upload_file_for_rag(upload, "p-001")

    assert result["provider"] == "local"
    assert result["fallback_used"] is True


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_forces_parser_override(monkeypatch):
    upload = _fake_upload(filename="fallback.pdf", fileType="pdf")
    capture = {}

    def _extract(filepath, filename, file_type, parser_override=None):
        capture["parser_override"] = parser_override
        return "forced local content", {"provider_used": "local"}

    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        _extract,
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: [text],
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
        upload,
        "p-001",
        parse_provider_override="local",
    )

    assert capture["parser_override"] == "local"
    assert result["provider"] == "local"


@pytest.mark.asyncio
async def test_index_upload_file_for_rag_marks_fallback_used_when_triggered(
    monkeypatch,
):
    upload = _fake_upload(filename="fallback.pdf", fileType="pdf")
    monkeypatch.setattr(
        rag_indexing_service,
        "extract_text_for_rag",
        lambda filepath, filename, file_type, parser_override=None: (
            "forced local content",
            {"provider_used": "local"},
        ),
    )
    monkeypatch.setattr(
        rag_indexing_service,
        "split_text",
        lambda text, chunk_size, chunk_overlap: [text],
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
        upload,
        "p-001",
        parse_provider_override="local",
        fallback_triggered=True,
    )

    assert result["fallback_used"] is True
    assert result["capability_status"]["fallback_used"] is True
    assert result["capability_status"]["fallback_target"] == "local"
