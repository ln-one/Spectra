"""Bounded fallback payloads for structured Word templates."""

from __future__ import annotations

from typing import Any

from .common import resolve_word_document_variant
from .payload import build_word_payload


def build_word_fallback_payload(
    *,
    document_variant: str,
    config: dict[str, Any],
    rag_snippets: list[str],
) -> dict[str, Any]:
    variant = resolve_word_document_variant(document_variant)
    topic = str(config.get("topic") or "教学主题").strip()
    teaching_model = str(config.get("teaching_model") or "scaffolded").strip()
    grade_band = str(config.get("grade_band") or "").strip()
    audience_label = f"{grade_band} 学段" if grade_band else "通用学习场景"
    difficulty_layer = str(config.get("difficulty_layer") or "B").strip()
    learning_goal = str(config.get("learning_goal") or "帮助学生掌握核心知识点").strip()
    teaching_context = str(
        config.get("teaching_context") or "围绕课程重点组织分层教学活动"
    ).strip()
    student_needs = str(config.get("student_needs") or "兼顾基础巩固与应用迁移").strip()
    output_requirements = str(
        config.get("output_requirements") or "输出结构清晰、可直接使用的教学文档"
    ).strip()
    snippet_1 = str(rag_snippets[0] or "").strip()[:180] if rag_snippets else ""
    snippet_2 = (
        str(rag_snippets[1] or "").strip()[:180] if len(rag_snippets) > 1 else ""
    )

    if variant == "layered_lesson_plan":
        return build_word_payload(
            document_variant=variant,
            payload={
                "title": f"{topic}分层教学教案",
                "summary": (
                    f"基于 {teaching_model} 教学模式，面向 {audience_label}，围绕"
                    f"{learning_goal} 组织 {difficulty_layer} 层分层教学活动。"
                ),
                "layout_payload": {
                    "teaching_context": teaching_context,
                    "learner_profile": student_needs,
                    "learning_objectives": {
                        "a_level": [
                            f"说出 {topic} 的基础概念",
                            "完成基础识记与判断任务",
                        ],
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
                "summary": f"面向 {audience_label} 的课堂讲义，聚焦 {learning_goal}，兼顾课上阅读与课后复习。",
                "layout_payload": {
                    "learning_goals": [
                        f"理解 {topic} 的核心概念",
                        "能用课堂语言复述关键机制",
                        "完成基础到应用的练习任务",
                    ],
                    "key_terms": [
                        {
                            "term": topic,
                            "explanation": snippet_1 or "课程主题对应的核心知识单元",
                        },
                        {
                            "term": "关键机制",
                            "explanation": "支撑主题运行或成立的主要过程",
                        },
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
                    "summary_box": snippet_2
                    or f"{topic} 的学习关键在于抓住概念边界、过程逻辑与实际应用。",
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
                                    "answer": snippet_1
                                    or "从定义、过程、结果三个维度作答。",
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
