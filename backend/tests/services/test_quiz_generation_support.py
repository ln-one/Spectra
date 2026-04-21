from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from services.generation_session_service import quiz_generation_support
from utils.exceptions import APIException


def test_resolve_quiz_model_prefers_quality_model(monkeypatch):
    monkeypatch.delenv("QUIZ_MODEL", raising=False)
    monkeypatch.setenv("QUALITY_MODEL", "qwen3.6-plus")

    assert quiz_generation_support.resolve_quiz_model() == "qwen3.6-plus"


def test_resolve_quiz_defaults_use_quality_budget(monkeypatch):
    monkeypatch.delenv("QUIZ_MAX_TOKENS", raising=False)
    monkeypatch.delenv("QUIZ_REVIEW_MAX_TOKENS", raising=False)
    monkeypatch.delenv("QUIZ_GENERATION_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("QUIZ_REVIEW_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("QUIZ_REFINE_TIMEOUT_SECONDS", raising=False)

    assert quiz_generation_support.resolve_quiz_max_tokens() == 3800
    assert quiz_generation_support.resolve_quiz_review_max_tokens() == 4200
    assert quiz_generation_support.resolve_quiz_timeout_seconds() == 480.0
    assert quiz_generation_support.resolve_quiz_review_timeout_seconds() == 480.0
    assert quiz_generation_support.resolve_quiz_refine_timeout_seconds() == 300.0


@pytest.mark.asyncio
async def test_generate_quiz_reviewed_payload_uses_specialized_prompts_and_trace(
    monkeypatch,
):
    generate_mock = AsyncMock(
        side_effect=[
            (
                {
                    "title": "牛顿第二定律小测",
                    "scope": "牛顿第二定律",
                    "questions": [
                        {
                            "id": "q-1",
                            "question": "合力增大时，加速度如何变化？",
                            "options": ["增大", "减小", "不变", "先增大后减小"],
                            "answer": "增大",
                            "explanation": "根据牛顿第二定律，质量不变时合力越大，加速度越大。",
                        }
                    ],
                },
                "qwen3.6-plus",
                {"tokens_used": 3200},
            ),
            (
                {
                    "title": "牛顿第二定律小测（优化）",
                    "scope": "牛顿第二定律",
                    "questions": [
                        {
                            "id": "q-1",
                            "question": "合力增大时，加速度如何变化？",
                            "options": ["增大", "减小", "不变", "无法判断"],
                            "answer": "增大",
                            "explanation": "质量不变时，合力越大，加速度越大。常见误区是把速度变化和加速度变化混淆。",
                        }
                    ],
                },
                "qwen3.6-plus",
                {"tokens_used": 3600},
            ),
        ]
    )
    monkeypatch.setattr(
        quiz_generation_support,
        "generate_card_json_payload_with_meta",
        generate_mock,
    )

    payload, model_name, trace = await quiz_generation_support.generate_quiz_reviewed_payload(
        config={
            "scope": "牛顿第二定律",
            "question_count": 5,
            "difficulty": "hard",
            "question_type": "single",
            "style_tags": ["强调易错点"],
        },
        rag_snippets=["[来源:lesson.md] 典型误区是混淆合力与速度。"],
        source_hint="力学讲义 (docx)",
    )

    first_prompt = generate_mock.await_args_list[0].kwargs["prompt"]
    second_prompt = generate_mock.await_args_list[1].kwargs["prompt"]
    assert "Target question count: 5" in first_prompt
    assert "exactly 4 non-empty, mutually distinct options" in first_prompt
    assert "强调易错点" in first_prompt
    assert "Initial quality score" in second_prompt
    assert "Draft compact snapshot" in second_prompt
    assert payload["title"] == "牛顿第二定律小测（优化）"
    assert model_name == "qwen3.6-plus"
    assert trace["generation_tokens_used"] == 3200
    assert trace["review_tokens_used"] == 3600
    assert trace["rag_snippet_count"] == 1


def test_enforce_quiz_quality_gate_includes_trace_metadata():
    with pytest.raises(APIException) as exc_info:
        quiz_generation_support.enforce_quiz_quality_gate(
            payload={
                "title": "很长很长很长很长很长很长的小测标题",
                "scope": "牛顿第二定律",
                "questions": [
                    {
                        "id": "q-1",
                        "question": "资料显示：见第3页 chunk 1。",
                        "options": ["A", "A", "以上皆是"],
                        "answer": "不存在的答案",
                        "explanation": "",
                    }
                ],
            },
            config={"question_count": 5},
            model_name="qwen3.6-plus",
            generation_trace={
                "resolved_model": "qwen3.6-plus",
                "review_max_tokens": 4200,
                "rag_snippet_count": 3,
            },
        )

    details = exc_info.value.details
    assert details["resolved_model"] == "qwen3.6-plus"
    assert details["max_tokens"] == 4200
    assert details["rag_snippet_count"] == 3
    assert details["quiz_quality_score"] < 74
