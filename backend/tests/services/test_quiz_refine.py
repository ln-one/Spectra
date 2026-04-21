from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.quiz_normalizer import (
    evaluate_quiz_payload_quality,
    normalize_interactive_quick_quiz_payload,
)
from services.generation_session_service.tool_refine_builder.quiz import (
    refine_quiz_content,
)


@pytest.mark.anyio
async def test_quiz_refine_prefers_selection_anchor_target() -> None:
    with patch(
        "services.generation_session_service.tool_refine_builder.quiz._load_rag_snippets",
        AsyncMock(return_value=["结合项目资料补充了解析。"]),
    ):
        updated = await refine_quiz_content(
            current_content={
                "kind": "quiz",
                "scope": "牛顿定律",
                "questions": [
                    {
                        "id": "q-1",
                        "question": "旧题 1",
                        "options": ["A", "B"],
                        "answer": "A",
                    },
                    {
                        "id": "q-2",
                        "question": "旧题 2",
                        "options": ["C", "D"],
                        "answer": "C",
                    },
                ],
            },
            message="请把第二题改得更强调边界条件",
            config={
                "current_question_id": "q-1",
                "selection_anchor": {
                    "scope": "question",
                    "anchor_id": "q-2",
                },
            },
            project_id="proj-1",
            rag_source_ids=["file-1"],
        )

    updated_questions = updated["questions"]
    assert updated_questions[1]["id"] == "q-2"
    assert updated_questions[1]["question"] == "请把第二题改得更强调边界条件"
    assert updated_questions[1]["explanation"] == "结合项目资料补充了解析。"
    assert updated["question_count"] == 2


@pytest.mark.anyio
async def test_quiz_direct_edit_question_replaces_only_target_question() -> None:
    updated = await refine_quiz_content(
        current_content={
            "kind": "quiz",
            "scope": "牛顿定律",
            "questions": [
                {
                    "id": "q-1",
                    "question": "旧题 1",
                    "options": ["A", "B"],
                    "answer": "A",
                    "explanation": "旧解析 1",
                },
                {
                    "id": "q-2",
                    "question": "旧题 2",
                    "options": ["C", "D"],
                    "answer": "C",
                    "explanation": "旧解析 2",
                },
            ],
        },
        message="直接编辑当前题",
        config={
            "operation": "direct_edit_question",
            "selection_anchor": {
                "scope": "question",
                "anchor_id": "q-2",
            },
            "edited_question": {
                "id": "q-2",
                "question": "新题 2",
                "options": ["新选项 A", "新选项 B"],
                "answer": "新选项 A",
                "explanation": "新解析 2",
            },
        },
        project_id="proj-1",
        rag_source_ids=None,
    )

    assert updated["questions"][0]["question"] == "旧题 1"
    assert updated["questions"][1]["question"] == "新题 2"
    assert updated["questions"][1]["answer"] == "新选项 A"
    assert updated["question_count"] == 2


@pytest.mark.anyio
async def test_quiz_direct_edit_question_missing_target_returns_conflict() -> None:
    with pytest.raises(Exception) as exc_info:
        await refine_quiz_content(
            current_content={
                "kind": "quiz",
                "scope": "牛顿定律",
                "questions": [
                    {
                        "id": "q-1",
                        "question": "旧题 1",
                        "options": ["A", "B"],
                        "answer": "A",
                    }
                ],
            },
            message="直接编辑当前题",
            config={
                "operation": "direct_edit_question",
                "selection_anchor": {
                    "scope": "question",
                    "anchor_id": "q-9",
                },
                "edited_question": {
                    "id": "q-9",
                    "question": "不会成功",
                    "options": ["A", "B"],
                    "answer": "A",
                    "explanation": "",
                },
            },
            project_id="proj-1",
            rag_source_ids=None,
        )

    assert "当前题目已过期" in str(exc_info.value)


def test_quiz_normalizer_stabilizes_shape_and_deduplicates_questions() -> None:
    normalized = normalize_interactive_quick_quiz_payload(
        payload={
            "title": "资料显示：牛顿第二定律课堂小测 json schema",
            "scope": "牛顿第二定律",
            "questions": [
                {
                    "id": "Question 1",
                    "question": "资料显示：牛顿第二定律描述了什么关系？",
                    "options": ["A. 力与加速度成正比", "B. 速度与位移成正比"],
                    "answer": "A",
                    "explanation": "[来源:file.pdf] 重点考查合力、质量与加速度之间的关系。",
                },
                {
                    "question": "牛顿第二定律描述了什么关系？",
                    "options": ["力与加速度成正比", "速度与位移成正比"],
                    "answer": 0,
                    "explanation": "",
                },
            ],
        },
        config={"question_count": 5},
    )

    assert normalized["kind"] == "quiz"
    assert normalized["question_count"] == 1
    assert normalized["questions"][0]["id"] == "question-1"
    assert normalized["questions"][0]["options"] == [
        "力与加速度成正比",
        "速度与位移成正比",
    ]
    assert normalized["questions"][0]["answer"] == "力与加速度成正比"


def test_quiz_quality_gate_flags_obvious_degradation() -> None:
    score, issues, metrics = evaluate_quiz_payload_quality(
        {
            "title": "这是一条特别长特别长特别长的课堂随堂小测标题，用来模拟退化",
            "questions": [
                {
                    "id": "q-1",
                    "question": "资料显示：请根据 chunk 3 内容回答 json schema 相关问题。",
                    "options": [],
                    "explanation": "",
                }
            ],
        },
        requested_question_count=5,
    )

    assert score < 72
    assert "question_count_shrunk" in issues
    assert "empty_options" in issues
    assert "rag_residue" in issues
    assert metrics["question_count"] == 1


@pytest.mark.anyio
async def test_quiz_chat_refine_uses_compact_snapshot_and_returns_full_artifact() -> None:
    generate_mock = AsyncMock(
        return_value={
            "content": (
                '{"title":"牛顿第二定律小测（强化版）","scope":"牛顿第二定律",'
                '"questions":[{"id":"q-1","question":"新的第一题","options":["A","B","C","D"],'
                '"answer":"A","explanation":"补充了解析。"},'
                '{"id":"q-2","question":"新的第二题","options":["对","错"],'
                '"answer":"对","explanation":"强调边界条件。"}]}'
            )
        }
    )
    with patch(
        "services.generation_session_service.tool_refine_builder.quiz._load_rag_snippets",
        AsyncMock(return_value=["[来源:file.pdf] 结合项目资料补充证据。"]),
    ), patch(
        "services.generation_session_service.tool_refine_builder.quiz.ai_service.generate",
        generate_mock,
    ):
        updated = await refine_quiz_content(
            current_content={
                "kind": "quiz",
                "title": "牛顿第二定律小测",
                "scope": "牛顿第二定律",
                "questions": [
                    {
                        "id": "q-1",
                        "question": "旧题 1",
                        "options": ["A", "B"],
                        "answer": "A",
                        "explanation": "旧解析 1",
                        "metadata": {"renderer": "noise"},
                    },
                    {
                        "id": "q-2",
                        "question": "旧题 2",
                        "options": ["C", "D"],
                        "answer": "C",
                        "explanation": "旧解析 2",
                        "edges": ["noise"],
                    },
                ],
            },
            message="整体改得更强调边界条件与易错点。",
            config={
                "chat_refine_scope": "full_quiz",
                "selection_anchor": {
                    "scope": "question",
                    "anchor_id": "q-2",
                },
            },
            project_id="proj-1",
            rag_source_ids=["file-1"],
        )

    prompt = generate_mock.await_args.kwargs["prompt"]
    assert '"focus_question_id": "q-2"' in prompt
    assert '"metadata"' not in prompt
    assert '"edges"' not in prompt
    assert updated["question_count"] == 2
    assert updated["questions"][1]["id"] == "q-2"
