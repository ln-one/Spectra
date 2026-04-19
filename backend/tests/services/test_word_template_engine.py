from __future__ import annotations

import pytest

from services.generation_session_service.word_template_engine import (
    build_word_fallback_payload,
    build_word_payload,
    build_word_schema_hint,
    validate_word_layout_payload,
)


@pytest.mark.parametrize(
    ("variant", "required_token"),
    [
        ("layered_lesson_plan", '"lesson_flow"'),
        ("student_handout", '"key_terms"'),
        ("post_class_quiz", '"exam_meta"'),
        ("lab_guide", '"experiment_meta"'),
    ],
)
def test_build_word_schema_hint_is_variant_aware(
    variant: str, required_token: str
) -> None:
    schema_hint = build_word_schema_hint(variant)
    assert '"layout_payload"' in schema_hint
    assert required_token in schema_hint


@pytest.mark.parametrize(
    "variant",
    [
        "layered_lesson_plan",
        "student_handout",
        "post_class_quiz",
        "lab_guide",
    ],
)
def test_build_word_fallback_payload_produces_renderable_content(variant: str) -> None:
    payload = build_word_fallback_payload(
        document_variant=variant,
        config={"topic": "进程管理", "document_variant": variant},
        rag_snippets=["RAG snippet 1", "RAG snippet 2"],
    )

    assert payload["kind"] == "teaching_document"
    assert payload["legacy_kind"] == "word_document"
    assert payload["schema_id"] == "lesson_plan_v1"
    assert payload["schema_version"] == 1
    assert payload["layout_version"] == "v1"
    assert payload["document_variant"] == variant
    assert isinstance(payload["layout_payload"], dict)
    assert isinstance(payload["lesson_plan"], dict)
    assert payload["lesson_plan_markdown"].startswith("# ")
    assert "<html" in payload["preview_html"]
    assert "<html" in payload["doc_source_html"]


def test_validate_word_layout_payload_rejects_missing_required_fields() -> None:
    with pytest.raises(ValueError) as exc_info:
        validate_word_layout_payload(
            "student_handout",
            {
                "learning_goals": ["目标"],
                "key_terms": [{"term": "A", "explanation": "B"}],
            },
        )

    assert "core_concepts" in str(exc_info.value)


def test_build_word_payload_generates_sections_and_html() -> None:
    payload = build_word_payload(
        document_variant="post_class_quiz",
        payload={
            "title": "进程管理课后测验",
            "summary": "覆盖基础概念与应用分析。",
            "layout_payload": {
                "exam_meta": {
                    "duration_minutes": 20,
                    "total_score": 100,
                    "instructions": ["按要求作答"],
                },
                "sections": [
                    {
                        "section_title": "选择题",
                        "question_type": "single_choice",
                        "questions": [
                            {
                                "prompt": "进程的定义是什么？",
                                "score": 10,
                                "options": ["A", "B", "C", "D"],
                                "answer": "A",
                                "analysis": "依据课堂定义判断。",
                            }
                        ],
                    }
                ],
                "answer_sheet": ["1. A"],
                "grading_notes": ["概念准确", "条理清晰"],
            },
        },
    )

    assert payload["sections"]
    assert payload["kind"] == "teaching_document"
    assert payload["schema_id"] == "lesson_plan_v1"
    assert isinstance(payload["lesson_plan"], dict)
    assert "试卷信息" in payload["lesson_plan_markdown"]
    assert "question-block" in payload["preview_html"]
