from eval.relevant_chunk_resolver import (
    resolve_case_relevant_chunk_ids,
    resolve_case_usable_chunk_ids,
)


def test_resolve_case_prefers_source_contains_matches():
    case = {
        "id": "real-001",
        "relevant_chunk_ids": [],
        "relevant_source_contains": ["多模态AI互动式教学智能体"],
        "expected_keywords": ["课件共创系统"],
    }
    parsed_chunks = [
        {
            "id": "chunk-a",
            "normalized_content": "开发一个多模态ai互动式教学智能体，构建以教师教学思路为驱动的课件共创系统。",
        },
        {
            "id": "chunk-b",
            "normalized_content": "无关内容",
        },
    ]

    resolved = resolve_case_relevant_chunk_ids(case, parsed_chunks)
    assert resolved == ["chunk-a"]


def test_resolve_case_falls_back_to_keyword_overlap():
    case = {
        "id": "real-002",
        "relevant_chunk_ids": [],
        "expected_keywords": ["多轮对话", "教学目标", "核心知识点"],
    }
    parsed_chunks = [
        {
            "id": "chunk-a",
            "normalized_content": "系统通过多轮对话理解教师的教学目标与核心知识点。",
        },
        {
            "id": "chunk-b",
            "normalized_content": "系统支持ppt导出。",
        },
    ]

    resolved = resolve_case_relevant_chunk_ids(case, parsed_chunks)
    assert resolved == ["chunk-a"]


def test_resolve_case_keeps_existing_chunk_ids():
    case = {
        "id": "real-003",
        "relevant_chunk_ids": ["chunk-fixed"],
        "expected_keywords": ["PDF", "Word"],
    }
    parsed_chunks = [
        {
            "id": "chunk-a",
            "normalized_content": "支持pdf和word",
        }
    ]

    resolved = resolve_case_relevant_chunk_ids(case, parsed_chunks)
    assert resolved == ["chunk-fixed"]


def test_resolve_usable_case_prefers_usable_source_contains():
    case = {
        "id": "real-004",
        "usable_chunk_ids": [],
        "usable_source_contains": ["主动询问、确认细节"],
        "expected_keywords": ["主动询问", "确认细节"],
    }
    parsed_chunks = [
        {
            "id": "chunk-a",
            "normalized_content": "系统支持主动询问、确认细节。",
        },
        {
            "id": "chunk-b",
            "normalized_content": "无关内容",
        },
    ]

    resolved = resolve_case_usable_chunk_ids(case, parsed_chunks)
    assert resolved == ["chunk-a"]


def test_resolve_usable_case_falls_back_to_relevant_ids():
    case = {
        "id": "real-005",
        "usable_chunk_ids": [],
        "relevant_chunk_ids": ["chunk-rel"],
        "expected_keywords": ["PDF", "Word"],
    }
    parsed_chunks = [
        {
            "id": "chunk-rel",
            "normalized_content": "支持pdf和word",
        }
    ]

    resolved = resolve_case_usable_chunk_ids(case, parsed_chunks)
    assert resolved == ["chunk-rel"]
