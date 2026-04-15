"""Word template schema hints and prompts."""

from __future__ import annotations

import json
from typing import Any

from .common import resolve_word_document_variant


def build_word_schema_hint(document_variant: str) -> str:
    variant = resolve_word_document_variant(document_variant)
    examples = {
        "layered_lesson_plan": {
            "title": "",
            "summary": "",
            "document_variant": "layered_lesson_plan",
            "layout_payload": {
                "teaching_context": "",
                "learner_profile": "",
                "learning_objectives": {
                    "a_level": [""],
                    "b_level": [""],
                    "c_level": [""],
                },
                "lesson_flow": [
                    {
                        "phase": "",
                        "duration": "",
                        "teacher_actions": [""],
                        "student_actions": [""],
                        "outputs": [""],
                    }
                ],
                "key_questions": [""],
                "differentiation_strategies": [""],
                "assessment_methods": [""],
                "homework": [""],
            },
        },
        "student_handout": {
            "title": "",
            "summary": "",
            "document_variant": "student_handout",
            "layout_payload": {
                "learning_goals": [""],
                "key_terms": [{"term": "", "explanation": ""}],
                "core_concepts": [{"heading": "", "bullets": [""]}],
                "worked_examples": [{"title": "", "steps": [""]}],
                "practice_tasks": [""],
                "summary_box": "",
                "after_class_notes": [""],
            },
        },
        "post_class_quiz": {
            "title": "",
            "summary": "",
            "document_variant": "post_class_quiz",
            "layout_payload": {
                "exam_meta": {
                    "duration_minutes": 20,
                    "total_score": 100,
                    "instructions": [""],
                },
                "sections": [
                    {
                        "section_title": "",
                        "question_type": "single_choice",
                        "questions": [
                            {
                                "prompt": "",
                                "score": 5,
                                "options": [""],
                                "answer": "",
                                "analysis": "",
                            }
                        ],
                    }
                ],
                "answer_sheet": [""],
                "grading_notes": [""],
            },
        },
        "lab_guide": {
            "title": "",
            "summary": "",
            "document_variant": "lab_guide",
            "layout_payload": {
                "experiment_meta": {
                    "experiment_name": "",
                    "estimated_time": "",
                    "difficulty": "",
                },
                "objectives": [""],
                "materials": [""],
                "safety_notes": [""],
                "procedure_steps": [
                    {
                        "step_no": 1,
                        "action": "",
                        "expected_result": "",
                    }
                ],
                "observation_table": {
                    "columns": [""],
                    "rows": [[""]],
                },
                "reflection_questions": [""],
                "submission_requirements": [""],
            },
        },
    }
    return json.dumps(examples[variant], ensure_ascii=False)


def build_word_prompt(
    *,
    document_variant: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> str:
    variant = resolve_word_document_variant(document_variant)
    variant_instructions = {
        "layered_lesson_plan": (
            "Focus on layered teaching objectives, lesson flow, differentiation, and assessment. "
            "Use concise teacher-ready language."
        ),
        "student_handout": (
            "Focus on readability for students. Prefer short bullets, term tables, guided examples, "
            "and practice tasks."
        ),
        "post_class_quiz": (
            "Produce a structured quiz paper. Group questions by question_type and assign explicit scores."
        ),
        "lab_guide": (
            "Produce an experiment guide with setup info, materials, safety notes, step-by-step procedure, "
            "observation table, and reflection questions."
        ),
    }
    return (
        "You are a teaching document content generator.\n"
        "Return ONLY a JSON object. Do not include markdown fences.\n"
        f"Document variant: {variant}\n"
        f"Config: {json.dumps(config, ensure_ascii=False)}\n"
        f"RAG snippets: {json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "Requirements:\n"
        "- Output title and summary as non-empty strings.\n"
        "- Output document_variant and layout_payload.\n"
        "- layout_payload must strictly match the requested variant schema.\n"
        "- Do not generate HTML, markdown, or style tokens.\n"
        "- Avoid placeholders like TBD / 待补充 / lorem ipsum.\n"
        f"- Variant focus: {variant_instructions[variant]}\n"
        f"Expected JSON shape example: {build_word_schema_hint(variant)}\n"
    )
