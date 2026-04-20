from services.chat import (
    resolve_effective_rag_source_ids,
    resolve_effective_selected_library_ids,
)


def test_resolve_effective_rag_source_ids_prefers_explicit_ids():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=["f-1", "f-2"],
        selected_file_ids=None,
        metadata={"rag_source_ids": ["f-3"]},
    )
    assert result == ["f-1", "f-2"]


def test_resolve_effective_rag_source_ids_falls_back_to_metadata():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=None,
        selected_file_ids=None,
        metadata={"selected_file_ids": ["f-1", "f-2"]},
    )
    assert result == ["f-1", "f-2"]


def test_resolve_effective_rag_source_ids_prefers_explicit_empty_selected_file_ids():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=None,
        selected_file_ids=[],
        metadata={"selected_file_ids": ["f-1", "f-2"]},
    )
    assert result == []


def test_resolve_effective_rag_source_ids_returns_none_when_no_ids():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=None,
        selected_file_ids=None,
        metadata={"selected_file_ids": []},
    )
    assert result is None


def test_resolve_effective_selected_library_ids_prefers_explicit_ids():
    result = resolve_effective_selected_library_ids(
        selected_library_ids=["lib-1", "lib-2"],
        metadata={"selected_library_ids": ["lib-3"]},
    )
    assert result == ["lib-1", "lib-2"]


def test_resolve_effective_selected_library_ids_falls_back_to_metadata():
    result = resolve_effective_selected_library_ids(
        selected_library_ids=None,
        metadata={"metadata": {"selected_library_ids": ["lib-1"]}},
    )
    assert result == ["lib-1"]
