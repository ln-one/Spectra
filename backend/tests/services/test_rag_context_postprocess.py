import pytest

from services.rag_service.context_postprocess import (
    ContextProcessingConfig,
    postprocess_rag_context,
)


@pytest.mark.asyncio
async def test_postprocess_deduplicates_near_duplicate_chunks_and_keeps_better_one():
    rag_results = [
        {
            "chunk_id": "chunk-low",
            "content": (
                "项目需求文档。本文档来自比赛原始需求。"
                "当前 AI 辅助教学工具存在的问题：功能单一、操作割裂。"
            ),
            "score": 0.71,
            "source": {"chunk_id": "chunk-low", "filename": "需求.pdf"},
            "metadata": {"upload_id": "file-1", "chunk_index": 0},
        },
        {
            "chunk_id": "chunk-high",
            "content": (
                "当前 AI 辅助教学工具存在的问题：功能单一、操作割裂，"
                "未形成以教师教学思路为核心的闭环工作流。"
            ),
            "score": 0.92,
            "source": {"chunk_id": "chunk-high", "filename": "需求.pdf"},
            "metadata": {"upload_id": "file-1", "chunk_index": 1},
        },
        {
            "chunk_id": "chunk-other",
            "content": "项目目标：开发多模态 AI 互动式教学智能体。",
            "score": 0.6,
            "source": {"chunk_id": "chunk-other", "filename": "需求.pdf"},
            "metadata": {"upload_id": "file-1", "chunk_index": 2},
        },
    ]

    processed, diagnostics = await postprocess_rag_context(
        query="当前AI辅助教学工具主要存在哪些问题",
        rag_results=rag_results,
        config=ContextProcessingConfig(
            enable_context_dedup=True,
            enable_context_compression=False,
            max_evidence_chunks=5,
            max_sentences_per_chunk=3,
            similarity_threshold=0.75,
        ),
    )

    assert [item["chunk_id"] for item in processed] == ["chunk-high", "chunk-other"]
    assert diagnostics.removed_chunks
    assert diagnostics.removed_chunks[0].chunk_id == "chunk-low"
    assert diagnostics.removed_chunks[0].kept_chunk_id == "chunk-high"


@pytest.mark.asyncio
async def test_postprocess_compresses_chunk_to_query_relevant_sentences():
    rag_results = [
        {
            "chunk_id": "chunk-1",
            "content": (
                "项目需求文档。本文档来自比赛原始需求。"
                "当前 AI 辅助教学工具存在的问题：功能单一、操作割裂，"
                "未形成以教师教学思路为核心的闭环工作流。"
                "教师需耗费大量时间在课件的内容组织、格式调整、资源搜寻等重复性劳动。"
                "项目价值：减负增效。"
            ),
            "score": 0.88,
            "source": {"chunk_id": "chunk-1", "filename": "需求.pdf"},
        }
    ]

    processed, diagnostics = await postprocess_rag_context(
        query="当前AI辅助教学工具主要存在哪些问题",
        rag_results=rag_results,
        config=ContextProcessingConfig(
            enable_context_dedup=False,
            enable_context_compression=True,
            compression_mode="rule",
            max_evidence_chunks=5,
            max_sentences_per_chunk=2,
            similarity_threshold=0.82,
        ),
    )

    assert len(processed) == 1
    assert "功能单一" in processed[0]["content"]
    assert "操作割裂" in processed[0]["content"]
    assert "本文档来自比赛原始需求" not in processed[0]["content"]
    assert diagnostics.compression_stats[0].compressed_length < diagnostics.compression_stats[0].original_length


@pytest.mark.asyncio
async def test_postprocess_honors_max_evidence_chunks_after_dedup():
    rag_results = [
        {
            "chunk_id": f"chunk-{index}",
            "content": f"第{index}条资料，包含不同的教学事实点 {index}",
            "score": 0.9 - (index * 0.01),
            "source": {"chunk_id": f"chunk-{index}", "filename": "需求.pdf"},
        }
        for index in range(6)
    ]

    processed, _ = await postprocess_rag_context(
        query="教学事实点",
        rag_results=rag_results,
        config=ContextProcessingConfig(
            enable_context_dedup=False,
            enable_context_compression=False,
            max_evidence_chunks=3,
            max_sentences_per_chunk=3,
            similarity_threshold=0.82,
        ),
    )

    assert [item["chunk_id"] for item in processed] == [
        "chunk-0",
        "chunk-1",
        "chunk-2",
    ]
