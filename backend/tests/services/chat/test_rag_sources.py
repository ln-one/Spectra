from services.chat import resolve_effective_rag_source_ids


def test_resolve_effective_rag_source_ids_prefers_explicit_ids():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=["f-1", "f-2"],
        metadata={"rag_source_ids": ["f-3"]},
    )
    assert result == ["f-1", "f-2"]


def test_resolve_effective_rag_source_ids_falls_back_to_metadata():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=None,
        metadata={"selected_file_ids": ["f-1", "f-2"]},
    )
    assert result == ["f-1", "f-2"]


def test_resolve_effective_rag_source_ids_returns_none_when_no_ids():
    result = resolve_effective_rag_source_ids(
        rag_source_ids=None,
        metadata={"selected_file_ids": []},
    )
    assert result is None
