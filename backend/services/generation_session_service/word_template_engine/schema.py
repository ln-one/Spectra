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


def build_word_markdown_prompt(
    *,
    document_variant: str,
    config: dict[str, Any],
    rag_snippets: list[str],
    source_hint: str | None = None,
) -> str:
    variant = resolve_word_document_variant(document_variant)
    topic = str(config.get("topic") or config.get("title") or "课堂教案").strip()
    audience = str(config.get("audience") or "通用学习者").strip()
    duration = str(config.get("class_duration") or "45分钟").strip()
    return (
        "你是资深教学设计专家，请输出可直接授课使用的高质量教案 Markdown。\n"
        "必须只输出 Markdown，不要 JSON，不要代码块围栏，不要解释性前后缀。\n"
        f"文档类型：{variant}\n"
        f"课程主题：{topic}\n"
        f"授课对象：{audience}\n"
        f"课时建议：{duration}\n"
        f"来源提示：{source_hint or '无'}\n"
        f"配置：{json.dumps(config, ensure_ascii=False)}\n"
        f"参考片段：{json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "写作目标：\n"
        "- 强调教学可执行性，教师拿到即可上课。\n"
        "- 把重点放在教学活动、学生产出、评价证据，不写空泛口号。\n"
        "- 对引用材料做归纳表达，不照抄噪声文本。\n"
        "结构约束（结构化但自由）：\n"
        "1) 第一行使用一级标题（#）。\n"
        "2) 至少 4 个二级标题（##），可根据主题自拟标题。\n"
        "3) 至少 2 个三级标题（###），用于流程分节或任务分层。\n"
        "4) 教学流程需体现教师活动、学生活动、产出/证据三要素。\n"
        "5) 至少包含 A/B/C 分层目标（可用小标题或列表）。\n"
        "Markdown 表达约束：\n"
        "- 必须使用无序列表（-）和有序列表，且同一组有序步骤需按 1. 2. 3. 递增编号。\n"
        "- 允许并鼓励使用表格展示“目标-活动-评价”或“介质对比”。\n"
        "- 段落尽量短句化，避免整段长文本。\n"
        "- 不得输出配置噪声词：standard/detail_level/schema/json。\n"
    )


def build_word_markdown_reviewer_prompt(
    *,
    topic: str,
    markdown: str,
) -> str:
    return (
        "你是教学文档审稿人。请在不改变主题事实的前提下，"
        "把下面教案 Markdown 优化成更清晰、更可执行的版本。\n"
        "只输出修订后的 Markdown，不要解释。\n"
        f"主题：{topic}\n"
        "审稿要求：\n"
        "- 强化层级：保证 # / ## / ### 清晰。\n"
        "- 强化 Markdown 丰富度：适度使用 -、递增编号的有序列表、表格。\n"
        "- 去除冗余废话和噪声符号，保留教学可执行信息。\n"
        "- 若原文已很好，仅做最小必要修订。\n"
        "待修订内容如下：\n"
        f"{markdown}\n"
    )
