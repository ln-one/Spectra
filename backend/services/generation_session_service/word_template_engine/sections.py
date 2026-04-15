"""Word layout section builders."""

from __future__ import annotations

from typing import Any

from .common import (
    _require_dict,
    _require_list,
    _string_list,
    resolve_word_document_variant,
)


def build_word_sections(
    document_variant: str,
    payload: dict[str, Any],
) -> list[dict[str, str]]:
    variant = resolve_word_document_variant(document_variant)
    layout = _require_dict(payload.get("layout_payload"), "layout_payload")

    if variant == "layered_lesson_plan":
        objectives = _require_dict(
            layout.get("learning_objectives"), "learning_objectives"
        )
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
                        "A层目标："
                        + "；".join(_string_list(objectives.get("a_level"))),
                        "B层目标："
                        + "；".join(_string_list(objectives.get("b_level"))),
                        "C层目标："
                        + "；".join(_string_list(objectives.get("c_level"))),
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
                        for item in _require_list(
                            layout.get("lesson_flow"), "lesson_flow"
                        )
                    ]
                ),
            },
            {
                "title": "评价与拓展",
                "content": "\n".join(
                    [
                        "关键问题："
                        + "；".join(_string_list(layout.get("key_questions"))),
                        "差异化支持："
                        + "；".join(
                            _string_list(layout.get("differentiation_strategies"))
                        ),
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
                        f"{item['heading']}\n"
                        + "；".join(_string_list(item.get("bullets")))
                        for item in _require_list(
                            layout.get("core_concepts"), "core_concepts"
                        )
                    ]
                ),
            },
            {
                "title": "例题与练习",
                "content": "\n\n".join(
                    [
                        f"{item['title']}\n"
                        + "\n".join(_string_list(item.get("steps")))
                        for item in _require_list(
                            layout.get("worked_examples"), "worked_examples"
                        )
                    ]
                    + [
                        "练习任务："
                        + "；".join(_string_list(layout.get("practice_tasks")))
                    ]
                ),
            },
            {
                "title": "课后整理",
                "content": "\n".join(
                    [
                        f"总结：{layout['summary_box']}",
                        "课后记录："
                        + "；".join(_string_list(layout.get("after_class_notes"))),
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
                        "作答说明："
                        + "；".join(_string_list(exam_meta.get("instructions"))),
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
                        "评分说明："
                        + "；".join(_string_list(layout.get("grading_notes"))),
                        "答案栏："
                        + "；".join(
                            _string_list(layout.get("answer_sheet")) or ["按题号填写"]
                        ),
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
                    for item in _require_list(
                        layout.get("procedure_steps"), "procedure_steps"
                    )
                ]
            ),
        },
        {
            "title": "记录与反思",
            "content": "\n".join(
                [
                    "观察指标："
                    + "；".join(
                        _string_list(
                            _require_dict(
                                layout.get("observation_table"),
                                "observation_table",
                            ).get("columns")
                        )
                    ),
                    "反思问题："
                    + "；".join(_string_list(layout.get("reflection_questions"))),
                    "提交要求："
                    + "；".join(_string_list(layout.get("submission_requirements"))),
                ]
            ),
        },
    ]
