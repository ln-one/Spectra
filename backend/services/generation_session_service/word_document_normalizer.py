from __future__ import annotations

import re
from typing import Any

from services.generation_session_service.word_template_engine import (
    build_word_payload,
    build_word_schema_hint,
    resolve_word_document_variant,
)
from .word_document_content import document_content_to_html, markdown_to_document_content


def resolve_word_document_schema_hint(config: dict[str, Any] | None = None) -> str:
    return build_word_schema_hint(
        resolve_word_document_variant((config or {}).get("document_variant"))
    )


def normalize_word_document_payload(
    payload: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    variant = resolve_word_document_variant(
        payload.get("document_variant") or (config or {}).get("document_variant")
    )
    normalized = build_word_payload(document_variant=variant, payload=payload)
    preferred_markdown = str(payload.get("lesson_plan_markdown") or "").strip()
    effective_markdown = preferred_markdown or str(
        normalized.get("lesson_plan_markdown") or ""
    ).strip()
    normalized["lesson_plan_markdown"] = effective_markdown
    normalized["document_content"] = markdown_to_document_content(effective_markdown)
    if preferred_markdown:
        normalized["preview_html"] = document_content_to_html(
            normalized["document_content"],
            title=str(normalized.get("title") or ""),
            summary=str(normalized.get("summary") or ""),
        )
        normalized["doc_source_html"] = normalized["preview_html"]
    return normalized


_NOISE_SUFFIX_PATTERN = re.compile(
    r"(?:[；;，,\s]+)?(?:standard|high|detail[_ -]?level|lesson_plan(?:_v1)?)\b.*$",
    flags=re.IGNORECASE,
)
_HEADING_PATTERN = re.compile(r"^##\s+(.+?)\s*$", flags=re.MULTILINE)
_AIM_PATTERN = re.compile(r"^[A-CＡ-Ｃ]\s*层目标[:：]?\s*(.+)$")


def sanitize_word_title(raw: str) -> str:
    candidate = str(raw or "").strip()
    if not candidate:
        return ""
    candidate = re.sub(r"^#\s*", "", candidate)
    candidate = _NOISE_SUFFIX_PATTERN.sub("", candidate)
    candidate = re.sub(r"[；;，,\-_/:\s]+$", "", candidate).strip()
    return candidate[:120]


def normalize_markdown_lesson_plan(markdown: str) -> str:
    candidate = str(markdown or "").strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 3 and lines[-1].strip().startswith("```"):
            candidate = "\n".join(lines[1:-1]).strip()
    candidate = candidate.replace("\r\n", "\n").replace("\r", "\n")
    candidate = re.sub(r"\n{3,}", "\n\n", candidate)
    return candidate.strip()


def _extract_summary(markdown: str) -> str:
    lines = [line.strip() for line in markdown.splitlines()]
    body_lines: list[str] = []
    seen_h1 = False
    for line in lines:
        if not line:
            if body_lines:
                break
            continue
        if line.startswith("# "):
            seen_h1 = True
            continue
        if line.startswith("## "):
            break
        if seen_h1:
            body_lines.append(line)
    summary = " ".join(body_lines).strip()
    if summary:
        return summary[:220]
    return "本节课围绕课程核心概念展开，强调可执行教学活动与可评价学习产出。"


def _extract_h1_title(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return sanitize_word_title(stripped[2:].strip())
    return ""


def _section_map(markdown: str) -> dict[str, str]:
    headings = list(_HEADING_PATTERN.finditer(markdown))
    mapping: dict[str, str] = {}
    for index, match in enumerate(headings):
        title = match.group(1).strip()
        start = match.end()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(markdown)
        content = markdown[start:end].strip()
        mapping[title] = content
    return mapping


def _find_section_content(sections: dict[str, str], *keys: str) -> str:
    for key in keys:
        for title, content in sections.items():
            if key in title:
                return content
    return ""


def _find_any_section_content(
    sections: dict[str, str],
    aliases: tuple[str, ...],
) -> str:
    for alias in aliases:
        found = _find_section_content(sections, alias)
        if found:
            return found
    return ""


def _split_items(text: str) -> list[str]:
    normalized = str(text or "").replace("；", "\n").replace(";", "\n")
    normalized = re.sub(r"^\s*[-*]\s*", "", normalized, flags=re.MULTILINE)
    return [line.strip(" 　-•\t") for line in normalized.splitlines() if line.strip()]


def _extract_labeled_items(text: str, labels: tuple[str, ...]) -> list[str]:
    for label in labels:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith(f"{label}：") or stripped.startswith(f"{label}:"):
                return _split_items(stripped.split("：", 1)[-1].split(":", 1)[-1])
    return []


def _extract_objective_levels(content: str) -> tuple[list[str], list[str], list[str]]:
    bucket: dict[str, list[str]] = {"A": [], "B": [], "C": []}
    for line in content.splitlines():
        stripped = line.strip()
        matched = _AIM_PATTERN.match(stripped)
        if not matched:
            continue
        prefix = stripped[0].upper()
        if prefix in {"Ａ", "Ｂ", "Ｃ"}:
            prefix = chr(ord("A") + "ＡＢＣ".index(prefix))
        bucket[prefix] = _split_items(matched.group(1))
    if not bucket["A"]:
        bucket["A"] = ["准确复述本课核心概念与基础术语。"]
    if not bucket["B"]:
        bucket["B"] = ["结合课堂案例解释关键机制并完成课堂任务。"]
    if not bucket["C"]:
        bucket["C"] = ["在新场景中迁移应用并提出改进方案。"]
    return bucket["A"], bucket["B"], bucket["C"]


def _extract_lesson_flow(content: str) -> list[dict[str, Any]]:
    chunks = [chunk.strip() for chunk in re.split(r"\n{2,}", content) if chunk.strip()]
    flow: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunks, start=1):
        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        if not lines:
            continue
        phase_line = lines[0]
        phase_match = re.match(r"^(.*?)[（(]([^()（）]+)[)）]\s*$", phase_line)
        if phase_match:
            phase = phase_match.group(1).strip() or f"教学环节{index}"
            duration = phase_match.group(2).strip()
        else:
            phase = re.sub(r"^\d+[.\s、]+", "", phase_line).strip() or f"教学环节{index}"
            duration = "10分钟"
        teacher_actions = _extract_labeled_items(chunk, ("教师活动",))
        student_actions = _extract_labeled_items(chunk, ("学生活动",))
        outputs = _extract_labeled_items(chunk, ("产出", "学习产出"))
        if not teacher_actions:
            teacher_actions = [f"围绕“{phase}”组织讲解与示范。"]
        if not student_actions:
            student_actions = [f"围绕“{phase}”完成讨论与练习。"]
        if not outputs:
            outputs = [f"形成“{phase}”阶段学习证据。"]
        flow.append(
            {
                "phase": phase,
                "duration": duration,
                "teacher_actions": teacher_actions,
                "student_actions": student_actions,
                "outputs": outputs,
            }
        )
    if flow:
        return flow
    return [
        {
            "phase": "知识导入",
            "duration": "10分钟",
            "teacher_actions": ["讲授情境并明确学习任务。"],
            "student_actions": ["基于问题讨论已有认知。"],
            "outputs": ["形成本节课问题清单。"],
        },
        {
            "phase": "概念建构",
            "duration": "20分钟",
            "teacher_actions": ["讲解核心概念并组织例题分析。"],
            "student_actions": ["完成关键概念记录与小组讨论。"],
            "outputs": ["完成概念图或要点表。"],
        },
        {
            "phase": "迁移应用",
            "duration": "15分钟",
            "teacher_actions": ["布置任务并组织展示点评。"],
            "student_actions": ["完成任务并进行同伴互评。"],
            "outputs": ["提交任务答案与反思要点。"],
        },
    ]


def build_word_payload_from_markdown(
    *,
    markdown: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_markdown = normalize_markdown_lesson_plan(markdown)
    if not normalized_markdown:
        raise ValueError("markdown_empty")
    sections = _section_map(normalized_markdown)
    if len(sections) < 3:
        raise ValueError("markdown_insufficient_sections")

    cfg = config or {}
    title = (
        _extract_h1_title(normalized_markdown)
        or sanitize_word_title(str(cfg.get("topic") or cfg.get("title") or "教学教案"))
        or "教学教案"
    )
    summary = _extract_summary(normalized_markdown)

    positioning = _find_any_section_content(
        sections, ("教学定位", "课程定位", "学情分析", "教学背景")
    )
    objective_section = _find_any_section_content(
        sections, ("分层目标", "教学目标", "学习目标")
    )
    flow_section = _find_any_section_content(
        sections, ("教学流程", "教学过程", "课堂流程", "教学活动")
    )
    evaluate_section = _find_any_section_content(
        sections, ("评价与拓展", "评价设计", "课堂评价", "评价反思")
    )
    homework_section = _find_any_section_content(
        sections, ("作业", "课后任务", "课后练习", "延伸任务")
    )

    teaching_context_items = _extract_labeled_items(positioning, ("教学情境", "教学定位"))
    learner_profile_items = _extract_labeled_items(positioning, ("学情画像", "学情分析"))
    a_level, b_level, c_level = _extract_objective_levels(objective_section)
    key_questions = _extract_labeled_items(evaluate_section, ("关键问题",))
    differentiation = _extract_labeled_items(evaluate_section, ("差异化支持",))
    assessment = _extract_labeled_items(evaluate_section, ("评价方式",))
    homework_items = _extract_labeled_items(homework_section, ("作业建议", "作业"))
    if not key_questions:
        key_questions = ["本节课核心概念为何成立？如何在真实问题中验证？"]
    if not differentiation:
        differentiation = ["基础层给出示例支架，进阶层增加迁移任务与开放提问。"]
    if not assessment:
        assessment = ["课堂提问、过程性观察与任务产出联合评价。"]
    if not homework_items:
        homework_items = _split_items(homework_section) or ["完成本节课知识巩固与迁移练习。"]

    return {
        "title": title,
        "summary": summary,
        "document_variant": resolve_word_document_variant(
            str(cfg.get("document_variant") or "layered_lesson_plan")
        ),
        "lesson_plan_markdown": normalized_markdown,
        "layout_payload": {
            "teaching_context": (
                teaching_context_items[0]
                if teaching_context_items
                else "结合真实教学情境引导学生建立问题意识。"
            ),
            "learner_profile": (
                learner_profile_items[0]
                if learner_profile_items
                else "学生具备基础概念但缺少迁移应用与结构化表达训练。"
            ),
            "learning_objectives": {
                "a_level": a_level,
                "b_level": b_level,
                "c_level": c_level,
            },
            "lesson_flow": _extract_lesson_flow(flow_section),
            "key_questions": key_questions,
            "differentiation_strategies": differentiation,
            "assessment_methods": assessment,
            "homework": homework_items,
        },
    }
