from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from utils.exceptions import APIException

from services.generation_session_service.tool_refine_builder.mindmap import (
    _load_refine_rag_snippets,
    _resolve_mindmap_refine_timeout_seconds,
    _resolve_mindmap_refine_max_tokens,
    _resolve_mindmap_refine_review_max_tokens,
    _resolve_mindmap_review_timeout_seconds,
    refine_mindmap_content,
)


def _build_large_mindmap(title: str) -> dict:
    return {
        "kind": "mindmap",
        "title": title,
        "summary": f"{title}知识导图",
        "nodes": [
            {"id": "root", "parent_id": None, "title": title, "summary": "核心主题"},
            {"id": "b1", "parent_id": "root", "title": "概念", "summary": "核心概念"},
            {"id": "b2", "parent_id": "root", "title": "机制", "summary": "关键机制"},
            {"id": "b3", "parent_id": "root", "title": "关系", "summary": "关系结构"},
            {"id": "b4", "parent_id": "root", "title": "应用", "summary": "典型应用"},
            {"id": "c1", "parent_id": "b1", "title": "定义", "summary": "基本定义"},
            {"id": "c2", "parent_id": "b1", "title": "边界", "summary": "适用边界"},
            {"id": "c3", "parent_id": "b2", "title": "过程", "summary": "运作过程"},
            {"id": "c4", "parent_id": "b2", "title": "条件", "summary": "成立条件"},
            {"id": "c5", "parent_id": "b3", "title": "对比", "summary": "比较视角"},
            {"id": "c6", "parent_id": "b3", "title": "联系", "summary": "关联关系"},
            {"id": "c7", "parent_id": "b4", "title": "案例", "summary": "案例说明"},
            {"id": "c8", "parent_id": "b4", "title": "误区", "summary": "常见误区"},
            {"id": "d1", "parent_id": "c3", "title": "步骤", "summary": "关键步骤"},
        ],
    }


@pytest.mark.asyncio
async def test_refine_mindmap_content_full_map_rewrite_uses_review_chain(monkeypatch):
    current_content = _build_large_mindmap("停止等待协议")
    generated_payload = _build_large_mindmap("停止等待协议")
    generated_payload["summary"] = "原始草稿"
    reviewed_payload = _build_large_mindmap("停止等待协议")
    reviewed_payload["summary"] = "重写后的完整导图"

    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map._load_rag_snippets",
        AsyncMock(return_value=["信道利用率与往返时延", "停等协议效率低于滑动窗口"]),
    )
    generate_payload = AsyncMock(side_effect=[(generated_payload, "model-a"), (reviewed_payload, "model-b")])
    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map.generate_card_json_payload",
        generate_payload,
    )

    updated = await refine_mindmap_content(
        current_content=current_content,
        message="把整张导图扩成五层的更壮观大图，并压缩重复节点",
        config={"chat_refine_scope": "full_map"},
        project_id="p-001",
        rag_source_ids=["file-1"],
    )

    assert updated["kind"] == "mindmap"
    assert updated["title"] == "停止等待协议"
    assert updated["summary"] == "重写后的完整导图"
    assert len(updated["nodes"]) >= 14
    assert generate_payload.await_count == 2
    first_prompt = generate_payload.await_args_list[0].kwargs["prompt"]
    review_prompt = generate_payload.await_args_list[1].kwargs["prompt"]
    assert "Current mind map snapshot" in first_prompt
    assert '"edges"' not in first_prompt
    assert '"metadata"' not in first_prompt
    assert "Draft compact snapshot" in review_prompt
    assert "Do not collapse the map into a one-node summary" in review_prompt
    assert "Keep at least 14 nodes" in review_prompt
    assert "requested at least 5 levels" in first_prompt
    assert "must reach depth 5 or more" in review_prompt


@pytest.mark.asyncio
async def test_refine_mindmap_content_targets_local_subtree_when_node_is_named(monkeypatch):
    current_content = _build_large_mindmap("停止等待协议")
    generated_payload = {
        "title": "过程",
        "summary": "扩展过程分支",
        "nodes": [
            {"id": "c3", "parent_id": None, "title": "过程", "summary": "过程主线"},
            {"id": "c3-a", "parent_id": "c3", "title": "发送阶段", "summary": "发送数据帧"},
            {"id": "c3-b", "parent_id": "c3", "title": "确认阶段", "summary": "等待确认"},
            {"id": "c3-a-1", "parent_id": "c3-a", "title": "缓存检查", "summary": "确认缓存可用"},
        ],
    }
    reviewed_payload = {
        "title": "过程",
        "summary": "扩展后的过程分支",
        "nodes": [
            {"id": "c3", "parent_id": None, "title": "过程", "summary": "过程主线"},
            {"id": "send", "parent_id": "c3", "title": "发送阶段", "summary": "发送数据帧"},
            {"id": "ack", "parent_id": "c3", "title": "确认阶段", "summary": "等待确认"},
            {"id": "timer", "parent_id": "ack", "title": "超时判断", "summary": "判断是否重传"},
            {"id": "retry", "parent_id": "timer", "title": "重传策略", "summary": "超时后重新发送"},
        ],
    }

    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map._load_rag_snippets",
        AsyncMock(return_value=["过程分支可以细分为发送、确认、超时和重传等环节。"]),
    )
    generate_payload = AsyncMock(side_effect=[(generated_payload, "model-a"), (reviewed_payload, "model-b")])
    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map.generate_card_json_payload",
        generate_payload,
    )

    updated = await refine_mindmap_content(
        current_content=current_content,
        message='给“过程”节点增加 3 个子节点，然后每个再增加 2 个节点',
        config={"chat_refine_scope": "full_map"},
        project_id="p-001",
        rag_source_ids=["file-1"],
    )

    assert updated["kind"] == "mindmap"
    process_children = [node for node in updated["nodes"] if node.get("parent_id") == "c3"]
    assert len(process_children) >= 2
    assert any(node["title"] == "发送阶段" for node in process_children)
    assert any(node["title"] == "确认阶段" for node in process_children)
    unrelated_branch = next(node for node in updated["nodes"] if node["id"] == "b1")
    assert unrelated_branch["title"] == "概念"
    first_prompt = generate_payload.await_args_list[0].kwargs["prompt"]
    assert "local subtree rewrite" in first_prompt.lower()
    assert "Target subtree snapshot" in first_prompt


@pytest.mark.asyncio
async def test_refine_mindmap_content_rejects_unknown_target_node(monkeypatch):
    current_content = _build_large_mindmap("停止等待协议")

    with pytest.raises(APIException) as exc_info:
        await refine_mindmap_content(
            current_content=current_content,
            message='给“不存在的节点”增加 3 个子节点',
            config={"chat_refine_scope": "full_map"},
            project_id="p-001",
            rag_source_ids=["file-1"],
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.details.get("failure_reason") == "mindmap_target_node_not_found"
    assert exc_info.value.details.get("candidate_node_titles") is not None


@pytest.mark.asyncio
async def test_refine_mindmap_content_edit_operation_matches_frontend_protocol(
    monkeypatch,
):
    current_content = _build_large_mindmap("停止等待协议")
    load_snippets = AsyncMock(return_value=["不应命中的 RAG 片段"])
    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap._load_refine_rag_snippets",
        load_snippets,
    )

    updated = await refine_mindmap_content(
        current_content=current_content,
        message="信道利用率",
        config={
            "selected_node_path": "b2",
            "node_operation": "edit",
            "manual_node_summary": "描述节点在导图中的具体含义。",
        },
        project_id="p-001",
        rag_source_ids=["file-1"],
    )

    edited = next(node for node in updated["nodes"] if node["id"] == "b2")
    assert edited["title"] == "信道利用率"
    assert edited["summary"] == "描述节点在导图中的具体含义。"
    assert updated["summary"] == "Updated node b2."
    load_snippets.assert_not_awaited()


@pytest.mark.asyncio
async def test_refine_mindmap_content_allows_result_when_requested_depth_not_met_but_quality_holds(
    monkeypatch,
):
    current_content = _build_large_mindmap("停止等待协议")
    generated_payload = _build_large_mindmap("停止等待协议")
    reviewed_payload = _build_large_mindmap("停止等待协议")

    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map._load_rag_snippets",
        AsyncMock(return_value=["信道利用率与往返时延"]),
    )
    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map.generate_card_json_payload",
        AsyncMock(side_effect=[(generated_payload, "model-a"), (reviewed_payload, "model-b")]),
    )

    updated = await refine_mindmap_content(
        current_content=current_content,
        message="把整张导图改成五层结构",
        config={"chat_refine_scope": "full_map"},
        project_id="p-001",
        rag_source_ids=["file-1"],
    )

    assert updated["kind"] == "mindmap"
    assert updated["title"] == "停止等待协议"


@pytest.mark.asyncio
async def test_load_refine_rag_snippets_filters_code_like_noise(monkeypatch):
    monkeypatch.setattr(
        "services.generation_session_service.tool_refine_builder.mindmap_full_map._load_rag_snippets",
        AsyncMock(
            return_value=[
                'function resolveLayoutType(spec) { return "structure_layers"; }',
                "[来源:foo.ts] export default function Demo() { return <div/> }",
                "5007 37 38 39 40 Time out elapsed_ms 30000 prompt_chars 1820",
                "![img](foo.png) ### markdown residue ###",
                "停止等待协议通过确认与超时重传保证可靠性，但信道利用率较低。",
            ]
        ),
    )

    snippets = await _load_refine_rag_snippets(
        project_id="p-001",
        query="扩成五层",
        rag_source_ids=["file-1"],
    )

    assert snippets == ["停止等待协议通过确认与超时重传保证可靠性，但信道利用率较低。"]


def test_mindmap_refine_token_budget_never_below_generation_floor(monkeypatch):
    monkeypatch.delenv("MINDMAP_REFINE_MAX_TOKENS", raising=False)
    monkeypatch.delenv("MINDMAP_REFINE_REVIEW_MAX_TOKENS", raising=False)
    monkeypatch.setenv("MINDMAP_MAX_TOKENS", "5800")
    monkeypatch.setenv("MINDMAP_REVIEW_MAX_TOKENS", "3900")

    assert _resolve_mindmap_refine_max_tokens() == 5800
    assert _resolve_mindmap_refine_review_max_tokens() == 5800

    monkeypatch.setenv("MINDMAP_REFINE_MAX_TOKENS", "4200")
    monkeypatch.setenv("MINDMAP_REFINE_REVIEW_MAX_TOKENS", "3200")
    assert _resolve_mindmap_refine_max_tokens() == 5800
    assert _resolve_mindmap_refine_review_max_tokens() == 5800

    monkeypatch.setenv("MINDMAP_REFINE_MAX_TOKENS", "6200")
    monkeypatch.setenv("MINDMAP_REFINE_REVIEW_MAX_TOKENS", "4500")
    assert _resolve_mindmap_refine_max_tokens() == 6200
    assert _resolve_mindmap_refine_review_max_tokens() == 5800

    monkeypatch.setenv("MINDMAP_REFINE_REVIEW_MAX_TOKENS", "6400")
    assert _resolve_mindmap_refine_review_max_tokens() == 6400


def test_mindmap_refine_timeout_priority(monkeypatch):
    monkeypatch.delenv("MINDMAP_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("MINDMAP_REFINE_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", raising=False)

    assert _resolve_mindmap_refine_timeout_seconds() is None
    assert _resolve_mindmap_review_timeout_seconds() is None

    monkeypatch.setenv("MINDMAP_TIMEOUT_SECONDS", "210")
    assert _resolve_mindmap_refine_timeout_seconds() == 210
    assert _resolve_mindmap_review_timeout_seconds() == 210

    monkeypatch.setenv("MINDMAP_REFINE_TIMEOUT_SECONDS", "330")
    assert _resolve_mindmap_refine_timeout_seconds() == 330
    assert _resolve_mindmap_review_timeout_seconds() == 330

    monkeypatch.setenv("MINDMAP_REVIEW_TIMEOUT_SECONDS", "480")
    assert _resolve_mindmap_review_timeout_seconds() == 480
