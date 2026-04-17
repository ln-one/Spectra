"""Word layout payload validation."""

from __future__ import annotations

from typing import Any

from .common import (
    _QUIZ_SECTION_TYPES,
    _require_dict,
    _require_list,
    _require_non_empty_str,
    _require_string_list,
    resolve_word_document_variant,
)


def validate_word_layout_payload(
    document_variant: str,
    payload: dict[str, Any] | Any,
) -> None:
    variant = resolve_word_document_variant(document_variant)
    layout = _require_dict(payload, "layout_payload")

    if variant == "layered_lesson_plan":
        _require_non_empty_str(layout.get("teaching_context"), "teaching_context")
        _require_non_empty_str(layout.get("learner_profile"), "learner_profile")
        objectives = _require_dict(
            layout.get("learning_objectives"), "learning_objectives"
        )
        _require_string_list(objectives.get("a_level"), "learning_objectives_a_level")
        _require_string_list(objectives.get("b_level"), "learning_objectives_b_level")
        _require_string_list(objectives.get("c_level"), "learning_objectives_c_level")
        flows = _require_list(layout.get("lesson_flow"), "lesson_flow")
        for index, item in enumerate(flows, start=1):
            step = _require_dict(item, f"lesson_flow_{index}")
            _require_non_empty_str(step.get("phase"), f"lesson_flow_{index}_phase")
            _require_non_empty_str(
                step.get("duration"), f"lesson_flow_{index}_duration"
            )
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
    _require_non_empty_str(
        experiment_meta.get("difficulty"), "experiment_meta_difficulty"
    )
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
    _require_string_list(
        layout.get("submission_requirements"), "submission_requirements"
    )
