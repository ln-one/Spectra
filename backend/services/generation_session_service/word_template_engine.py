from __future__ import annotations

import copy
import html
import json
from typing import Any

WORD_LAYOUT_VERSION = "v1"

WORD_DOCUMENT_VARIANTS = {
    "layered_lesson_plan",
    "student_handout",
    "post_class_quiz",
    "lab_guide",
}

_QUIZ_SECTION_TYPES = {
    "single_choice",
    "fill_blank",
    "short_answer",
    "application",
}


def resolve_word_document_variant(value: str | None) -> str:
    normalized = str(value or "layered_lesson_plan").strip()
    if normalized in WORD_DOCUMENT_VARIANTS:
        return normalized
    return "layered_lesson_plan"


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


def _require_non_empty_str(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name}_empty")
    return text


def _require_list(value: Any, field_name: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field_name}_empty")
    return value


def _require_string_list(value: Any, field_name: str) -> list[str]:
    items = _require_list(value, field_name)
    normalized = [str(item).strip() for item in items if str(item or "").strip()]
    if not normalized:
        raise ValueError(f"{field_name}_empty")
    return normalized


def _require_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not value:
        raise ValueError(f"{field_name}_empty")
    return value


def validate_word_layout_payload(
    document_variant: str,
    payload: dict[str, Any] | Any,
) -> None:
    variant = resolve_word_document_variant(document_variant)
    layout = _require_dict(payload, "layout_payload")

    if variant == "layered_lesson_plan":
        _require_non_empty_str(layout.get("teaching_context"), "teaching_context")
        _require_non_empty_str(layout.get("learner_profile"), "learner_profile")
        objectives = _require_dict(layout.get("learning_objectives"), "learning_objectives")
        _require_string_list(objectives.get("a_level"), "learning_objectives_a_level")
        _require_string_list(objectives.get("b_level"), "learning_objectives_b_level")
        _require_string_list(objectives.get("c_level"), "learning_objectives_c_level")
        flows = _require_list(layout.get("lesson_flow"), "lesson_flow")
        for index, item in enumerate(flows, start=1):
            step = _require_dict(item, f"lesson_flow_{index}")
            _require_non_empty_str(step.get("phase"), f"lesson_flow_{index}_phase")
            _require_non_empty_str(step.get("duration"), f"lesson_flow_{index}_duration")
            _require_string_list(
                step.get("teacher_actions"),
                f"lesson_flow_{index}_teacher_actions",
            )
            _require_string_list(
                step.get("student_actions"),
                f"lesson_flow_{index}_student_actions",
            )
            _require_string_list(step.get("outputs"), f"lesson_flow_{index}_outputs")
        _require_string_list(layout.get("key_questions"), "key_questions")
        _require_string_list(
            layout.get("differentiation_strategies"),
            "differentiation_strategies",
        )
        _require_string_list(layout.get("assessment_methods"), "assessment_methods")
        _require_string_list(layout.get("homework"), "homework")
        return

    if variant == "student_handout":
        _require_string_list(layout.get("learning_goals"), "learning_goals")
        key_terms = _require_list(layout.get("key_terms"), "key_terms")
        for index, item in enumerate(key_terms, start=1):
            row = _require_dict(item, f"key_terms_{index}")
            _require_non_empty_str(row.get("term"), f"key_terms_{index}_term")
            _require_non_empty_str(
                row.get("explanation"),
                f"key_terms_{index}_explanation",
            )
        concepts = _require_list(layout.get("core_concepts"), "core_concepts")
        for index, item in enumerate(concepts, start=1):
            concept = _require_dict(item, f"core_concepts_{index}")
            _require_non_empty_str(
                concept.get("heading"),
                f"core_concepts_{index}_heading",
            )
            _require_string_list(
                concept.get("bullets"),
                f"core_concepts_{index}_bullets",
            )
        examples = _require_list(layout.get("worked_examples"), "worked_examples")
        for index, item in enumerate(examples, start=1):
            example = _require_dict(item, f"worked_examples_{index}")
            _require_non_empty_str(
                example.get("title"),
                f"worked_examples_{index}_title",
            )
            _require_string_list(
                example.get("steps"),
                f"worked_examples_{index}_steps",
            )
        _require_string_list(layout.get("practice_tasks"), "practice_tasks")
        _require_non_empty_str(layout.get("summary_box"), "summary_box")
        _require_string_list(layout.get("after_class_notes"), "after_class_notes")
        return

    if variant == "post_class_quiz":
        exam_meta = _require_dict(layout.get("exam_meta"), "exam_meta")
        duration_minutes = exam_meta.get("duration_minutes")
        if not isinstance(duration_minutes, int) or duration_minutes <= 0:
            raise ValueError("exam_meta_duration_minutes_invalid")
        total_score = exam_meta.get("total_score")
        if not isinstance(total_score, (int, float)) or total_score <= 0:
            raise ValueError("exam_meta_total_score_invalid")
        _require_string_list(exam_meta.get("instructions"), "exam_meta_instructions")
        sections = _require_list(layout.get("sections"), "sections")
        for section_index, item in enumerate(sections, start=1):
            section = _require_dict(item, f"sections_{section_index}")
            _require_non_empty_str(
                section.get("section_title"),
                f"sections_{section_index}_title",
            )
            question_type = _require_non_empty_str(
                section.get("question_type"),
                f"sections_{section_index}_question_type",
            )
            if question_type not in _QUIZ_SECTION_TYPES:
                raise ValueError(f"sections_{section_index}_question_type_invalid")
            questions = _require_list(
                section.get("questions"),
                f"sections_{section_index}_questions",
            )
            for question_index, question_item in enumerate(questions, start=1):
                question = _require_dict(
                    question_item,
                    f"sections_{section_index}_questions_{question_index}",
                )
                _require_non_empty_str(
                    question.get("prompt"),
                    f"sections_{section_index}_questions_{question_index}_prompt",
                )
                score = question.get("score")
                if not isinstance(score, (int, float)) or score <= 0:
                    raise ValueError(
                        f"sections_{section_index}_questions_{question_index}_score_invalid"
                    )
                if question_type == "single_choice":
                    options = _require_string_list(
                        question.get("options"),
                        f"sections_{section_index}_questions_{question_index}_options",
                    )
                    if len(options) < 2:
                        raise ValueError(
                            f"sections_{section_index}_questions_{question_index}_options_too_short"
                        )
                answer = question.get("answer")
                if answer not in (None, ""):
                    if isinstance(answer, list):
                        _require_string_list(
                            answer,
                            f"sections_{section_index}_questions_{question_index}_answer",
                        )
                    else:
                        _require_non_empty_str(
                            answer,
                            f"sections_{section_index}_questions_{question_index}_answer",
                        )
                analysis = question.get("analysis")
                if analysis not in (None, ""):
                    _require_non_empty_str(
                        analysis,
                        f"sections_{section_index}_questions_{question_index}_analysis",
                    )
        answer_sheet = layout.get("answer_sheet")
        if answer_sheet not in (None, "") and answer_sheet != []:
            _require_string_list(answer_sheet, "answer_sheet")
        _require_string_list(layout.get("grading_notes"), "grading_notes")
        return

    experiment_meta = _require_dict(layout.get("experiment_meta"), "experiment_meta")
    _require_non_empty_str(
        experiment_meta.get("experiment_name"),
        "experiment_meta_experiment_name",
    )
    _require_non_empty_str(
        experiment_meta.get("estimated_time"),
        "experiment_meta_estimated_time",
    )
    _require_non_empty_str(experiment_meta.get("difficulty"), "experiment_meta_difficulty")
    _require_string_list(layout.get("objectives"), "objectives")
    _require_string_list(layout.get("materials"), "materials")
    _require_string_list(layout.get("safety_notes"), "safety_notes")
    steps = _require_list(layout.get("procedure_steps"), "procedure_steps")
    for index, item in enumerate(steps, start=1):
        step = _require_dict(item, f"procedure_steps_{index}")
        step_no = step.get("step_no")
        if not isinstance(step_no, int) or step_no <= 0:
            raise ValueError(f"procedure_steps_{index}_step_no_invalid")
        _require_non_empty_str(step.get("action"), f"procedure_steps_{index}_action")
        _require_non_empty_str(
            step.get("expected_result"),
            f"procedure_steps_{index}_expected_result",
        )
    observation_table = _require_dict(
        layout.get("observation_table"),
        "observation_table",
    )
    _require_string_list(observation_table.get("columns"), "observation_table_columns")
    rows = _require_list(observation_table.get("rows"), "observation_table_rows")
    for index, row in enumerate(rows, start=1):
        _require_string_list(row, f"observation_table_rows_{index}")
    _require_string_list(layout.get("reflection_questions"), "reflection_questions")
    _require_string_list(layout.get("submission_requirements"), "submission_requirements")


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _html_list(items: list[str]) -> str:
    return "".join(f"<li>{html.escape(item)}</li>" for item in items)


def _html_card(title: str, body: str, extra_class: str = "") -> str:
    class_name = "card"
    if extra_class:
        class_name = f"{class_name} {extra_class}"
    return (
        f'<section class="{class_name}">'
        f"<h3>{html.escape(title)}</h3>"
        f"{body}"
        "</section>"
    )


def build_word_sections(
    document_variant: str,
    payload: dict[str, Any],
) -> list[dict[str, str]]:
    variant = resolve_word_document_variant(document_variant)
    layout = _require_dict(payload.get("layout_payload"), "layout_payload")

    if variant == "layered_lesson_plan":
        objectives = _require_dict(layout.get("learning_objectives"), "learning_objectives")
        return [
            {
                "title": "教学定位",
                "content": "\n".join(
                    [
                        f"教学情境：{layout['teaching_context']}",
                        f"学情画像：{layout['learner_profile']}",
                    ]
                ),
            },
            {
                "title": "分层目标",
                "content": "\n".join(
                    [
                        "A层目标：" + "；".join(_string_list(objectives.get("a_level"))),
                        "B层目标：" + "；".join(_string_list(objectives.get("b_level"))),
                        "C层目标：" + "；".join(_string_list(objectives.get("c_level"))),
                    ]
                ),
            },
            {
                "title": "教学流程",
                "content": "\n".join(
                    [
                        (
                            f"{item['phase']}（{item['duration']}）\n"
                            f"教师活动：{'；'.join(_string_list(item.get('teacher_actions')))}\n"
                            f"学生活动：{'；'.join(_string_list(item.get('student_actions')))}\n"
                            f"产出：{'；'.join(_string_list(item.get('outputs')))}"
                        )
                        for item in _require_list(layout.get("lesson_flow"), "lesson_flow")
                    ]
                ),
            },
            {
                "title": "评价与拓展",
                "content": "\n".join(
                    [
                        "关键问题：" + "；".join(_string_list(layout.get("key_questions"))),
                        "差异化支持："
                        + "；".join(_string_list(layout.get("differentiation_strategies"))),
                        "评价方式："
                        + "；".join(_string_list(layout.get("assessment_methods"))),
                        "作业建议：" + "；".join(_string_list(layout.get("homework"))),
                    ]
                ),
            },
        ]

    if variant == "student_handout":
        return [
            {
                "title": "学习目标",
                "content": "；".join(_string_list(layout.get("learning_goals"))),
            },
            {
                "title": "关键术语",
                "content": "\n".join(
                    [
                        f"{item['term']}：{item['explanation']}"
                        for item in _require_list(layout.get("key_terms"), "key_terms")
                    ]
                ),
            },
            {
                "title": "核心知识",
                "content": "\n\n".join(
                    [
                        f"{item['heading']}\n" + "；".join(_string_list(item.get("bullets")))
                        for item in _require_list(layout.get("core_concepts"), "core_concepts")
                    ]
                ),
            },
            {
                "title": "例题与练习",
                "content": "\n\n".join(
                    [
                        f"{item['title']}\n" + "\n".join(_string_list(item.get("steps")))
                        for item in _require_list(layout.get("worked_examples"), "worked_examples")
                    ]
                    + ["练习任务：" + "；".join(_string_list(layout.get("practice_tasks")))]
                ),
            },
            {
                "title": "课后整理",
                "content": "\n".join(
                    [
                        f"总结：{layout['summary_box']}",
                        "课后记录：" + "；".join(_string_list(layout.get("after_class_notes"))),
                    ]
                ),
            },
        ]

    if variant == "post_class_quiz":
        exam_meta = _require_dict(layout.get("exam_meta"), "exam_meta")
        sections = _require_list(layout.get("sections"), "sections")
        return [
            {
                "title": "试卷信息",
                "content": "\n".join(
                    [
                        f"时长：{exam_meta['duration_minutes']} 分钟",
                        f"总分：{exam_meta['total_score']} 分",
                        "作答说明：" + "；".join(_string_list(exam_meta.get("instructions"))),
                    ]
                ),
            },
            {
                "title": "题目结构",
                "content": "\n\n".join(
                    [
                        f"{section['section_title']}（{section['question_type']}）\n"
                        + "\n".join(
                            [
                                (
                                    f"{index + 1}. {question['prompt']} "
                                    f"[{question['score']}分]"
                                )
                                for index, question in enumerate(
                                    _require_list(section.get("questions"), "questions")
                                )
                            ]
                        )
                        for section in sections
                    ]
                ),
            },
            {
                "title": "阅卷提示",
                "content": "\n".join(
                    [
                        "评分说明：" + "；".join(_string_list(layout.get("grading_notes"))),
                        "答案栏："
                        + "；".join(_string_list(layout.get("answer_sheet")) or ["按题号填写"]),
                    ]
                ),
            },
        ]

    experiment_meta = _require_dict(layout.get("experiment_meta"), "experiment_meta")
    return [
        {
            "title": "实验概况",
            "content": "\n".join(
                [
                    f"实验名称：{experiment_meta['experiment_name']}",
                    f"预计时长：{experiment_meta['estimated_time']}",
                    f"难度等级：{experiment_meta['difficulty']}",
                ]
            ),
        },
        {
            "title": "目标与准备",
            "content": "\n".join(
                [
                    "实验目标：" + "；".join(_string_list(layout.get("objectives"))),
                    "实验材料：" + "；".join(_string_list(layout.get("materials"))),
                    "安全提醒：" + "；".join(_string_list(layout.get("safety_notes"))),
                ]
            ),
        },
        {
            "title": "实验步骤",
            "content": "\n\n".join(
                [
                    f"步骤 {item['step_no']}：{item['action']}\n预期结果：{item['expected_result']}"
                    for item in _require_list(layout.get("procedure_steps"), "procedure_steps")
                ]
            ),
        },
        {
            "title": "记录与反思",
            "content": "\n".join(
                [
                    "观察指标：" + "；".join(
                        _string_list(
                            _require_dict(
                                layout.get("observation_table"),
                                "observation_table",
                            ).get("columns")
                        )
                    ),
                    "反思问题：" + "；".join(_string_list(layout.get("reflection_questions"))),
                    "提交要求："
                    + "；".join(_string_list(layout.get("submission_requirements"))),
                ]
            ),
        },
    ]


def build_word_markdown(document_variant: str, payload: dict[str, Any]) -> str:
    lines = [f"# {payload['title']}", "", payload["summary"]]
    for section in build_word_sections(document_variant, payload):
        lines.extend(["", f"## {section['title']}", "", section["content"]])
    return "\n".join(lines).strip()


def _render_layout_body(document_variant: str, payload: dict[str, Any]) -> str:
    variant = resolve_word_document_variant(document_variant)
    layout = payload["layout_payload"]
    summary_html = f"<p class=\"lede\">{html.escape(payload['summary'])}</p>"

    if variant == "layered_lesson_plan":
        objectives = layout["learning_objectives"]
        flow_rows = "".join(
            [
                (
                    "<tr>"
                    f"<td>{html.escape(item['phase'])}</td>"
                    f"<td>{html.escape(item['duration'])}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('teacher_actions'))))}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('student_actions'))))}</td>"
                    f"<td>{html.escape('；'.join(_string_list(item.get('outputs'))))}</td>"
                    "</tr>"
                )
                for item in layout["lesson_flow"]
            ]
        )
        return (
            summary_html
            + '<div class="meta-grid">'
            + _html_card("教学情境", f"<p>{html.escape(layout['teaching_context'])}</p>")
            + _html_card("学情画像", f"<p>{html.escape(layout['learner_profile'])}</p>")
            + "</div>"
            + '<div class="triple-grid">'
            + _html_card("A层目标", f"<ul>{_html_list(_string_list(objectives.get('a_level')))}</ul>", "accent-a")
            + _html_card("B层目标", f"<ul>{_html_list(_string_list(objectives.get('b_level')))}</ul>", "accent-b")
            + _html_card("C层目标", f"<ul>{_html_list(_string_list(objectives.get('c_level')))}</ul>", "accent-c")
            + "</div>"
            + _html_card(
                "教学流程",
                (
                    "<table><thead><tr><th>环节</th><th>时长</th><th>教师活动</th>"
                    "<th>学生活动</th><th>产出</th></tr></thead>"
                    f"<tbody>{flow_rows}</tbody></table>"
                ),
            )
            + '<div class="two-grid">'
            + _html_card("关键问题", f"<ul>{_html_list(_string_list(layout.get('key_questions')))}</ul>")
            + _html_card(
                "差异化与评价",
                (
                    "<p><strong>差异化支持：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('differentiation_strategies'))))}</p>"
                    "<p><strong>评价方式：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('assessment_methods'))))}</p>"
                    "<p><strong>作业建议：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('homework'))))}</p>"
                ),
            )
            + "</div>"
        )

    if variant == "student_handout":
        terms_rows = "".join(
            [
                "<tr>"
                f"<td>{html.escape(item['term'])}</td>"
                f"<td>{html.escape(item['explanation'])}</td>"
                "</tr>"
                for item in layout["key_terms"]
            ]
        )
        concept_cards = "".join(
            [
                _html_card(
                    item["heading"],
                    f"<ul>{_html_list(_string_list(item.get('bullets')))}</ul>",
                )
                for item in layout["core_concepts"]
            ]
        )
        example_cards = "".join(
            [
                _html_card(
                    item["title"],
                    f"<ol>{''.join(f'<li>{html.escape(step)}</li>' for step in _string_list(item.get('steps')))}</ol>",
                    "example-card",
                )
                for item in layout["worked_examples"]
            ]
        )
        return (
            summary_html
            + _html_card("学习目标", f"<ul>{_html_list(_string_list(layout.get('learning_goals')))}</ul>")
            + _html_card(
                "关键术语",
                "<table><thead><tr><th>术语</th><th>解释</th></tr></thead>"
                f"<tbody>{terms_rows}</tbody></table>",
            )
            + '<div class="card-stack">' + concept_cards + "</div>"
            + '<div class="two-grid">'
            + _html_card("例题拆解", example_cards)
            + _html_card(
                "练习与总结",
                (
                    "<p><strong>练习任务：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('practice_tasks'))))}</p>"
                    "<blockquote>"
                    f"{html.escape(layout['summary_box'])}"
                    "</blockquote>"
                    "<p><strong>课后整理：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('after_class_notes'))))}</p>"
                ),
            )
            + "</div>"
        )

    if variant == "post_class_quiz":
        section_blocks = []
        for section in layout["sections"]:
            questions_html = "".join(
                [
                    (
                        '<div class="question-block">'
                        f"<p><strong>{index + 1}. {html.escape(question['prompt'])}</strong> "
                        f"（{question['score']}分）</p>"
                        + (
                            "<ul>"
                            + _html_list(_string_list(question.get("options")))
                            + "</ul>"
                            if _string_list(question.get("options"))
                            else ""
                        )
                        + (
                            f"<p class=\"muted\"><strong>参考答案：</strong>{html.escape(str(question['answer']))}</p>"
                            if str(question.get("answer") or "").strip()
                            else ""
                        )
                        + (
                            f"<p class=\"muted\"><strong>解析：</strong>{html.escape(str(question['analysis']))}</p>"
                            if str(question.get("analysis") or "").strip()
                            else ""
                        )
                        + "</div>"
                    )
                    for index, question in enumerate(section["questions"])
                ]
            )
            section_blocks.append(
                _html_card(
                    f"{section['section_title']} / {section['question_type']}",
                    questions_html,
                )
            )
        exam_meta = layout["exam_meta"]
        return (
            summary_html
            + _html_card(
                "试卷信息",
                (
                    "<p><strong>作答时长：</strong>"
                    f"{exam_meta['duration_minutes']} 分钟</p>"
                    "<p><strong>总分：</strong>"
                    f"{exam_meta['total_score']} 分</p>"
                    "<p><strong>作答说明：</strong>"
                    f"{html.escape('；'.join(_string_list(exam_meta.get('instructions'))))}</p>"
                ),
            )
            + "".join(section_blocks)
            + _html_card(
                "评分与答案栏",
                (
                    "<p><strong>评分提示：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('grading_notes'))))}</p>"
                    "<p><strong>答案栏：</strong>"
                    f"{html.escape('；'.join(_string_list(layout.get('answer_sheet')) or ['按题号填写']))}</p>"
                ),
            )
        )

    observation = layout["observation_table"]
    rows = "".join(
        [
            "<tr>"
            + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row)
            + "</tr>"
            for row in observation["rows"]
        ]
    )
    return (
        summary_html
        + _html_card(
            "实验概况",
            (
                "<p><strong>实验名称：</strong>"
                f"{html.escape(layout['experiment_meta']['experiment_name'])}</p>"
                "<p><strong>预计时长：</strong>"
                f"{html.escape(layout['experiment_meta']['estimated_time'])}</p>"
                "<p><strong>难度等级：</strong>"
                f"{html.escape(layout['experiment_meta']['difficulty'])}</p>"
            ),
        )
        + '<div class="two-grid">'
        + _html_card("实验目标", f"<ul>{_html_list(_string_list(layout.get('objectives')))}</ul>")
        + _html_card("材料与安全", (
            "<p><strong>实验材料：</strong>"
            f"{html.escape('；'.join(_string_list(layout.get('materials'))))}</p>"
            "<p><strong>安全提醒：</strong>"
            f"{html.escape('；'.join(_string_list(layout.get('safety_notes'))))}</p>"
        ))
        + "</div>"
        + _html_card(
            "实验步骤",
            "<ol>"
            + "".join(
                [
                    (
                        f"<li><strong>{html.escape(item['action'])}</strong>"
                        f"<br /><span class=\"muted\">预期结果：{html.escape(item['expected_result'])}</span></li>"
                    )
                    for item in layout["procedure_steps"]
                ]
            )
            + "</ol>",
        )
        + _html_card(
            "观察记录",
            "<table><thead><tr>"
            + "".join(
                f"<th>{html.escape(column)}</th>"
                for column in _string_list(observation.get("columns"))
            )
            + "</tr></thead><tbody>"
            + rows
            + "</tbody></table>",
        )
        + _html_card(
            "反思与提交",
            (
                "<p><strong>反思问题：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('reflection_questions'))))}</p>"
                "<p><strong>提交要求：</strong>"
                f"{html.escape('；'.join(_string_list(layout.get('submission_requirements'))))}</p>"
            ),
        )
    )


def _render_word_html(document_variant: str, payload: dict[str, Any], *, printable: bool) -> str:
    body = _render_layout_body(document_variant, payload)
    printable_class = " printable" if printable else ""
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(payload["title"])}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f5f7fb;
      --paper: #ffffff;
      --ink: #14213d;
      --muted: #5b6475;
      --line: #d8deea;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --green-soft: #dcfce7;
      --amber-soft: #fef3c7;
      --rose-soft: #fee2e2;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: {"0" if printable else "24px"};
      background: {"#ffffff" if printable else "var(--bg)"};
      color: var(--ink);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      line-height: 1.6;
    }}
    .doc-shell{printable_class} {{
      max-width: 980px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 32px;
      box-shadow: {"none" if printable else "0 20px 50px rgba(15, 23, 42, 0.08)"};
    }}
    .doc-header {{ margin-bottom: 24px; }}
    .eyebrow {{ color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }}
    h1 {{ margin: 8px 0 0; font-size: 30px; line-height: 1.25; }}
    h2 {{ margin: 0 0 10px; font-size: 20px; }}
    h3 {{ margin: 0 0 10px; font-size: 16px; }}
    p, li, td, th, blockquote {{ font-size: 14px; }}
    .lede {{ color: var(--muted); margin: 0 0 18px; }}
    .meta-grid, .two-grid, .triple-grid {{ display: grid; gap: 16px; margin-bottom: 16px; }}
    .meta-grid, .two-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .triple-grid {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
    .card-stack {{ display: grid; gap: 16px; margin-bottom: 16px; }}
    .card {{
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      background: #fff;
      margin-bottom: 16px;
    }}
    .accent-a {{ background: var(--accent-soft); }}
    .accent-b {{ background: var(--green-soft); }}
    .accent-c {{ background: var(--amber-soft); }}
    .example-card {{ background: #f8fafc; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border: 1px solid var(--line); padding: 10px; vertical-align: top; text-align: left; }}
    th {{ background: #eff6ff; }}
    ul, ol {{ margin: 0; padding-left: 20px; }}
    blockquote {{
      margin: 12px 0 0;
      padding: 12px 14px;
      border-left: 4px solid var(--accent);
      background: #f8fafc;
    }}
    .muted {{ color: var(--muted); }}
    .question-block + .question-block {{ margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); }}
    @media (max-width: 860px) {{
      body {{ padding: 12px; }}
      .doc-shell {{ padding: 20px; border-radius: 18px; }}
      .meta-grid, .two-grid, .triple-grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main class="doc-shell{printable_class}">
    <header class="doc-header">
      <div class="eyebrow">{html.escape(resolve_word_document_variant(document_variant).replace("_", " "))}</div>
      <h1>{html.escape(payload["title"])}</h1>
    </header>
    {body}
  </main>
</body>
</html>"""


def render_word_preview_html(document_variant: str, payload: dict[str, Any]) -> str:
    return _render_word_html(document_variant, payload, printable=False)


def render_word_doc_source_html(document_variant: str, payload: dict[str, Any]) -> str:
    return _render_word_html(document_variant, payload, printable=True)


def build_word_payload(
    *,
    document_variant: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    variant = resolve_word_document_variant(document_variant)
    title = _require_non_empty_str(payload.get("title"), "title")
    summary = _require_non_empty_str(payload.get("summary"), "summary")
    layout_payload = copy.deepcopy(_require_dict(payload.get("layout_payload"), "layout_payload"))
    validate_word_layout_payload(variant, layout_payload)
    normalized = {
        "kind": "word_document",
        "layout_version": WORD_LAYOUT_VERSION,
        "title": title,
        "summary": summary,
        "document_variant": variant,
        "layout_payload": layout_payload,
    }
    normalized["sections"] = build_word_sections(variant, normalized)
    normalized["lesson_plan_markdown"] = build_word_markdown(variant, normalized)
    normalized["preview_html"] = render_word_preview_html(variant, normalized)
    normalized["doc_source_html"] = render_word_doc_source_html(variant, normalized)
    return normalized


def build_word_fallback_payload(
    *,
    document_variant: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> dict[str, Any]:
    variant = resolve_word_document_variant(document_variant)
    topic = str(config.get("topic") or "教学主题").strip()
    teaching_model = str(config.get("teaching_model") or "scaffolded").strip()
    grade_band = str(config.get("grade_band") or "high").strip()
    difficulty_layer = str(config.get("difficulty_layer") or "B").strip()
    learning_goal = str(config.get("learning_goal") or "帮助学生掌握核心知识点").strip()
    teaching_context = str(config.get("teaching_context") or "围绕课程重点组织分层教学活动").strip()
    student_needs = str(config.get("student_needs") or "兼顾基础巩固与应用迁移").strip()
    output_requirements = str(config.get("output_requirements") or "输出结构清晰、可直接使用的教学文档").strip()
    snippet_1 = str(rag_snippets[0] or "").strip()[:180] if rag_snippets else ""
    snippet_2 = str(rag_snippets[1] or "").strip()[:180] if len(rag_snippets) > 1 else ""

    if variant == "layered_lesson_plan":
        return build_word_payload(
            document_variant=variant,
            payload={
                "title": f"{topic}分层教学教案",
                "summary": (
                    f"基于 {teaching_model} 教学模式，面向 {grade_band} 学段，围绕"
                    f"{learning_goal} 组织 {difficulty_layer} 层分层教学活动。"
                ),
                "layout_payload": {
                    "teaching_context": teaching_context,
                    "learner_profile": student_needs,
                    "learning_objectives": {
                        "a_level": [f"说出 {topic} 的基础概念", "完成基础识记与判断任务"],
                        "b_level": [f"解释 {topic} 的关键机制", "能够结合案例分析过程"],
                        "c_level": [f"迁移应用 {topic} 解决实际问题", "形成结构化表达"],
                    },
                    "lesson_flow": [
                        {
                            "phase": "导入",
                            "duration": "8分钟",
                            "teacher_actions": ["提出真实场景问题", "激活先验经验"],
                            "student_actions": ["联系已有知识", "描述问题现象"],
                            "outputs": ["形成问题驱动"],
                        },
                        {
                            "phase": "新授",
                            "duration": "20分钟",
                            "teacher_actions": [
                                f"讲解 {topic} 核心概念",
                                snippet_1 or "结合资料梳理知识主线",
                            ],
                            "student_actions": ["完成概念记录", "参与例题分析"],
                            "outputs": ["建立概念框架"],
                        },
                        {
                            "phase": "巩固",
                            "duration": "12分钟",
                            "teacher_actions": ["组织分层练习", "即时点评共性问题"],
                            "student_actions": ["分层完成任务", "同伴交流策略"],
                            "outputs": ["完成分层练习单"],
                        },
                    ],
                    "key_questions": [
                        f"{topic} 的核心边界是什么？",
                        "不同场景下应如何选择分析方法？",
                    ],
                    "differentiation_strategies": [
                        "A层提供概念提示卡",
                        "B层加入过程比较题",
                        "C层加入迁移应用任务",
                    ],
                    "assessment_methods": [
                        "课堂追问",
                        "分层练习表现",
                        "结构化口头总结",
                    ],
                    "homework": [
                        "整理课堂笔记",
                        snippet_2 or "完成一题案例分析并说明解题依据",
                    ],
                },
            },
        )

    if variant == "student_handout":
        return build_word_payload(
            document_variant=variant,
            payload={
                "title": f"{topic}学生讲义",
                "summary": f"面向 {grade_band} 学段的课堂讲义，聚焦 {learning_goal}，兼顾课上阅读与课后复习。",
                "layout_payload": {
                    "learning_goals": [
                        f"理解 {topic} 的核心概念",
                        "能用课堂语言复述关键机制",
                        "完成基础到应用的练习任务",
                    ],
                    "key_terms": [
                        {"term": topic, "explanation": snippet_1 or "课程主题对应的核心知识单元"},
                        {"term": "关键机制", "explanation": "支撑主题运行或成立的主要过程"},
                    ],
                    "core_concepts": [
                        {
                            "heading": "核心知识主线",
                            "bullets": [
                                f"围绕 {topic} 梳理概念、过程与应用",
                                "抓住因果关系与典型误区",
                            ],
                        },
                        {
                            "heading": "课堂重点",
                            "bullets": [
                                student_needs,
                                output_requirements,
                            ],
                        },
                    ],
                    "worked_examples": [
                        {
                            "title": "例题 1：概念辨析",
                            "steps": [
                                "先明确题干考查对象",
                                "回到定义判断关键词",
                                "用一句话说明判断理由",
                            ],
                        },
                        {
                            "title": "例题 2：场景应用",
                            "steps": [
                                "提取场景中的约束条件",
                                "匹配对应知识点",
                                "总结解题策略",
                            ],
                        },
                    ],
                    "practice_tasks": [
                        "完成课堂练习",
                        "尝试用自己的语言讲给同伴听",
                    ],
                    "summary_box": snippet_2 or f"{topic} 的学习关键在于抓住概念边界、过程逻辑与实际应用。",
                    "after_class_notes": [
                        "记录尚未掌握的概念",
                        "整理一条可迁移的解题策略",
                    ],
                },
            },
        )

    if variant == "post_class_quiz":
        return build_word_payload(
            document_variant=variant,
            payload={
                "title": f"{topic}课后测验",
                "summary": f"围绕 {topic} 设计的课后测验，覆盖基础识记、理解分析与应用迁移。",
                "layout_payload": {
                    "exam_meta": {
                        "duration_minutes": 25,
                        "total_score": 100,
                        "instructions": [
                            "先通读试卷再作答",
                            "按题号规范书写",
                            "简答题需写出依据",
                        ],
                    },
                    "sections": [
                        {
                            "section_title": "基础选择",
                            "question_type": "single_choice",
                            "questions": [
                                {
                                    "prompt": f"下列关于 {topic} 的说法，最准确的一项是？",
                                    "score": 10,
                                    "options": ["A", "B", "C", "D"],
                                    "answer": "A",
                                    "analysis": "回到课堂定义，识别关键限定条件。",
                                }
                            ],
                        },
                        {
                            "section_title": "理解分析",
                            "question_type": "short_answer",
                            "questions": [
                                {
                                    "prompt": f"结合课堂内容说明 {topic} 的关键机制。",
                                    "score": 20,
                                    "answer": snippet_1 or "从定义、过程、结果三个维度作答。",
                                    "analysis": "答案应体现结构化表达。",
                                }
                            ],
                        },
                    ],
                    "answer_sheet": ["选择题：____", "简答题：____"],
                    "grading_notes": ["概念表述准确", "逻辑完整", "能结合情境说明"],
                },
            },
        )

    return build_word_payload(
        document_variant=variant,
        payload={
            "title": f"{topic}实验指导书",
            "summary": f"围绕 {topic} 设计的实验指导书，强调步骤执行、观察记录与结果反思。",
            "layout_payload": {
                "experiment_meta": {
                    "experiment_name": f"{topic}实验任务",
                    "estimated_time": "40分钟",
                    "difficulty": difficulty_layer,
                },
                "objectives": [
                    f"理解 {topic} 的实验目标",
                    "掌握操作流程与记录方式",
                ],
                "materials": ["实验环境", "记录表", "课堂资料"],
                "safety_notes": ["按步骤操作", "及时记录异常现象"],
                "procedure_steps": [
                    {
                        "step_no": 1,
                        "action": "阅读实验背景并确认任务要求",
                        "expected_result": "明确实验目标与评价标准",
                    },
                    {
                        "step_no": 2,
                        "action": "依次执行实验步骤并记录关键现象",
                        "expected_result": snippet_1 or "获得可用于分析的实验结果",
                    },
                    {
                        "step_no": 3,
                        "action": "对照结果完成总结与反思",
                        "expected_result": "形成实验结论与改进建议",
                    },
                ],
                "observation_table": {
                    "columns": ["步骤", "现象", "分析"],
                    "rows": [
                        ["步骤1", "____", "____"],
                        ["步骤2", "____", "____"],
                    ],
                },
                "reflection_questions": [
                    "实验结果与预期是否一致？",
                    "如果出现偏差，原因可能是什么？",
                ],
                "submission_requirements": [
                    "提交完整记录表",
                    output_requirements,
                ],
            },
        },
    )
