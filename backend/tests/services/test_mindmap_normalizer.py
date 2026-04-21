from __future__ import annotations

from services.generation_session_service.mindmap_normalizer import (
    evaluate_mindmap_payload_quality,
    normalize_knowledge_mindmap_payload,
)


def test_normalize_knowledge_mindmap_payload_cleans_noise_and_flattens_tree():
    payload = {
        "title": "停止等待协议（见第3页）",
        "summary": "[来源:ch3.pdf] 资料里提到这是基础机制。",
        "nodes": [
            {
                "id": " root ",
                "parent_id": None,
                "title": "停止等待协议（来源: ch3.pdf）",
                "summary": "资料显示：用于可靠传输。",
                "children": [
                    {
                        "id": "branch-a",
                        "title": "效率问题 chunk 01",
                        "summary": "见第 12 页，原文提到利用率受 RTT 影响。",
                    },
                    {
                        "id": "branch-a-dup",
                        "title": "效率问题",
                        "summary": "重复节点",
                    },
                ],
            },
            {
                "id": "extra-root",
                "title": "stop_and_wait.pdf",
                "summary": "",
            },
        ],
    }

    normalized = normalize_knowledge_mindmap_payload(payload)

    assert normalized["title"] == "停止等待协议"
    assert normalized["summary"] == "这是基础机制"
    titles = [node["title"] for node in normalized["nodes"]]
    assert "效率问题" in titles
    assert "效率问题 chunk 01" not in titles
    assert "stop_and_wait.pdf" not in titles
    assert titles.count("效率问题") == 1
    assert any(node["parent_id"] is None for node in normalized["nodes"])


def test_evaluate_mindmap_payload_quality_rejects_small_noisy_tree():
    payload = {
        "title": "数据链路层",
        "nodes": [
            {"id": "root", "parent_id": None, "title": "数据链路层"},
            {
                "id": "node-1",
                "parent_id": "root",
                "title": "资料里提到的定义",
                "summary": "见第3页 chunk 01",
            },
            {"id": "node-2", "parent_id": "node-1", "title": "展开说明"},
        ],
    }

    score, issues, metrics = evaluate_mindmap_payload_quality(payload)

    assert score < 70
    assert "mindmap_too_small" in issues
    assert "contains_rag_noise" in issues
    assert metrics["node_count"] == 3


def test_evaluate_mindmap_payload_quality_accepts_large_asymmetric_tree():
    payload = {
        "title": "信道利用率",
        "nodes": [
            {"id": "root", "parent_id": None, "title": "信道利用率"},
            {"id": "a", "parent_id": "root", "title": "核心定义"},
            {"id": "b", "parent_id": "root", "title": "影响因素"},
            {"id": "c", "parent_id": "root", "title": "效率推导"},
            {"id": "a1", "parent_id": "a", "title": "发送周期"},
            {"id": "a2", "parent_id": "a", "title": "有效负载"},
            {"id": "b1", "parent_id": "b", "title": "传播时延"},
            {"id": "c1", "parent_id": "c", "title": "公式结构"},
            {"id": "c2", "parent_id": "c", "title": "变量关系"},
            {"id": "c1a", "parent_id": "c1", "title": "发送时间"},
            {"id": "c1b", "parent_id": "c1", "title": "往返等待"},
            {"id": "c1a1", "parent_id": "c1a", "title": "帧长影响"},
            {"id": "c1a2", "parent_id": "c1a", "title": "链路带宽"},
            {"id": "c1b1", "parent_id": "c1b", "title": "确认返回"},
            {"id": "c1b2", "parent_id": "c1b", "title": "空闲等待"},
            {"id": "c1b2a", "parent_id": "c1b2", "title": "低利用率来源"},
            {"id": "c2a", "parent_id": "c2", "title": "公式变形"},
            {"id": "c2b", "parent_id": "c2", "title": "比例关系"},
        ],
    }

    score, issues, metrics = evaluate_mindmap_payload_quality(payload)

    assert score >= 70
    assert "contains_rag_noise" not in issues
    assert "mindmap_too_small" not in issues
    assert metrics["max_depth"] >= 4
    assert metrics["primary_branch_count"] == 3
