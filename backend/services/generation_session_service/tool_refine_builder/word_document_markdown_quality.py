"""Markdown quality helpers for word document chat refine."""

from __future__ import annotations

import json
import re


def _extract_markdown_title(markdown: str) -> str:
    for line in str(markdown or "").splitlines():
        stripped = line.strip()
        match = re.match(r"^#\s+(.+)$", stripped)
        if match:
            return match.group(1).strip()
    return ""


def _normalize_refined_markdown_outline(markdown: str) -> str:
    normalized = str(markdown or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return ""

    lines = normalized.split("\n")
    normalized_lines: list[str] = []
    first_heading_seen = False
    previous_heading_level = 0
    active_level_shift = 0

    for raw_line in lines:
        stripped = raw_line.strip()
        match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if not match:
            normalized_lines.append(raw_line)
            continue

        heading_text = match.group(2).strip()
        raw_level = len(match.group(1))
        if not first_heading_seen:
            level = 1
            first_heading_seen = True
            active_level_shift = 0
        else:
            if raw_level == 1:
                level = 2
                active_level_shift = 1
            else:
                level = raw_level + active_level_shift
            level = min(level, 3)
            if previous_heading_level >= 2 and level > previous_heading_level + 1:
                level = previous_heading_level + 1
            level = max(level, 2)

        previous_heading_level = level
        normalized_lines.append(f"{'#' * level} {heading_text}")

    return "\n".join(normalized_lines).strip()


def _normalize_ordered_list_numbering(markdown: str) -> str:
    lines = str(markdown or "").splitlines()
    normalized_lines: list[str] = []
    current_index = 0

    for line in lines:
        match = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if not match:
            current_index = 0
            normalized_lines.append(line)
            continue
        current_index = current_index + 1 if current_index else 1
        normalized_lines.append(f"{match.group(1)}{current_index}. {match.group(3)}")

    return "\n".join(normalized_lines)


def _extract_markdown_headings(markdown: str) -> list[tuple[int, str]]:
    headings: list[tuple[int, str]] = []
    for line in str(markdown or "").splitlines():
        match = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if not match:
            continue
        headings.append((len(match.group(1)), match.group(2).strip()))
    return headings


def _split_markdown_table_row(line: str) -> list[str]:
    stripped = str(line or "").strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_markdown_table_separator(line: str) -> bool:
    cells = _split_markdown_table_row(line)
    if not cells:
        return False
    has_dash = False
    for cell in cells:
        normalized = cell.replace("-", "").replace(":", "").strip()
        if normalized:
            return False
        if "-" in cell:
            has_dash = True
    return has_dash


def _is_markdown_table_row(line: str) -> bool:
    return str(line or "").strip().count("|") >= 2


def _count_valid_markdown_tables(markdown: str) -> int:
    lines = [line.rstrip() for line in str(markdown or "").splitlines()]
    count = 0
    index = 0
    while index + 1 < len(lines):
        if _is_markdown_table_row(lines[index]) and _is_markdown_table_separator(
            lines[index + 1]
        ):
            count += 1
            index += 2
            while index < len(lines) and _is_markdown_table_row(lines[index]):
                index += 1
            continue
        index += 1
    return count


def _has_broken_table_like_lines(markdown: str) -> bool:
    lines = [line.rstrip() for line in str(markdown or "").splitlines()]
    index = 0
    while index < len(lines):
        current = lines[index]
        if not _is_markdown_table_row(current):
            index += 1
            continue
        if index + 1 < len(lines) and _is_markdown_table_separator(lines[index + 1]):
            index += 2
            while index < len(lines) and _is_markdown_table_row(lines[index]):
                index += 1
            continue
        return True
    return False


def _extract_required_section_titles(markdown: str) -> list[str]:
    important_fragments = (
        "教学目标",
        "学习目标",
        "核心知识点",
        "知识点映射",
        "教学主流程",
        "教学流程",
        "教学过程",
        "分层任务",
        "评价量规",
        "评价与拓展",
        "教学调整",
    )
    titles: list[str] = []
    for level, title in _extract_markdown_headings(markdown):
        if level > 3:
            continue
        if any(fragment in title for fragment in important_fragments):
            titles.append(title)
    return titles


def _has_broken_formula_spacing(markdown: str) -> bool:
    patterns = (
        r"\\mathsf\s*\{\s*(?:[A-Za-z]\s+){2,}[A-Za-z]\s*\}",
        r"\\mathrm\s*\{\s*(?:[A-Za-z0-9=]\s+){2,}[A-Za-z0-9=]\s*\}",
    )
    return any(re.search(pattern, markdown) for pattern in patterns)


def _collect_markdown_quality_issues(
    *,
    base_markdown: str,
    candidate_markdown: str,
) -> list[str]:
    issues: list[str] = []
    candidate_headings = _extract_markdown_headings(candidate_markdown)
    candidate_h1_count = sum(1 for level, _ in candidate_headings if level == 1)
    if candidate_h1_count == 0:
        issues.append("missing_primary_heading")
    if candidate_h1_count > 1:
        issues.append("multiple_primary_headings")

    previous_level = 0
    for index, (level, _) in enumerate(candidate_headings):
        if index > 0 and level == 1:
            issues.append("multiple_primary_headings")
            break
        if previous_level >= 2 and level > previous_level + 1:
            issues.append("heading_hierarchy_broken")
            break
        previous_level = level

    base_table_count = _count_valid_markdown_tables(base_markdown)
    candidate_table_count = _count_valid_markdown_tables(candidate_markdown)
    if base_table_count > 0 and candidate_table_count < base_table_count:
        issues.append("markdown_table_lost")
    if _has_broken_table_like_lines(candidate_markdown):
        issues.append("broken_markdown_table")

    base_structure_count = len(
        [heading for heading in _extract_markdown_headings(base_markdown) if heading[0] <= 3]
    )
    candidate_structure_count = len(
        [heading for heading in candidate_headings if heading[0] <= 3]
    )
    if base_structure_count >= 3 and candidate_structure_count < max(
        2, (base_structure_count * 3 + 4) // 5
    ):
        issues.append("structure_collapsed")

    base_required_sections = _extract_required_section_titles(base_markdown)
    missing_sections = [
        title for title in base_required_sections if title not in candidate_markdown
    ]
    if missing_sections:
        issues.append("missing_sections:" + ",".join(missing_sections[:4]))

    base_length = len(base_markdown.strip())
    candidate_length = len(candidate_markdown.strip())
    if base_length >= 800 and candidate_length < int(base_length * 0.55):
        issues.append("content_collapsed")

    if _has_broken_formula_spacing(candidate_markdown):
        issues.append("broken_formula_spacing")

    return list(dict.fromkeys(issues))


def _build_refine_prompt(
    *,
    base_markdown: str,
    message: str,
    rag_snippets: list[str],
) -> str:
    return (
        "你是高质量教学文档编辑助手。请根据“修改要求”直接改写当前 Markdown 教案。\n"
        "只输出改写后的完整 Markdown，不要解释，不要代码块围栏，不要附加说明。\n"
        "本次改写的第一目标不是花哨，而是结构保真、表格保真、教学质量增强。\n"
        "必须遵守：\n"
        "- 全文只能有一个 # 主标题。\n"
        "- 主体章节优先使用 ##，子节优先使用 ###，不要把多级标题压平成同一级。\n"
        "- 原文存在 Markdown 表格时，优先保留并增强表格；除非修改要求明确要求，不得把表格降级成列表。\n"
        "- 原文中的分层目标、流程表、量规、任务清单、评价区块，除非修改要求明确删除，不得无故丢失。\n"
        "- 允许使用标题、段落、无序列表、有序列表、Markdown 表格。\n"
        "- 不要输出异常符号、破碎公式、伪表格、单行管道烂表、HTML 标签。\n"
        "- 若原文已经有较强结构，改写后必须至少不弱于原稿。\n"
        f"修改要求：{message}\n"
        f"参考片段：{json.dumps(rag_snippets, ensure_ascii=False)}\n"
        "当前 Markdown：\n"
        f"{base_markdown}\n"
    )


def _build_repair_prompt(
    *,
    base_markdown: str,
    candidate_markdown: str,
    message: str,
    issues: list[str],
) -> str:
    return (
        "你上一版教学文档 Markdown 改写结果存在结构退化问题。请修复后重新输出完整 Markdown。\n"
        "只输出最终 Markdown，不要解释，不要代码块围栏。\n"
        "修复要求：\n"
        "- 保留原文中有价值的结构与表格。\n"
        "- 修复一级标题数量、标题层级、表格合法性、章节缺失和格式噪声。\n"
        "- 改写后的结果必须至少不弱于原稿。\n"
        f"修改要求：{message}\n"
        f"检测到的问题：{json.dumps(issues, ensure_ascii=False)}\n"
        "原始 Markdown：\n"
        f"{base_markdown}\n\n"
        "待修复的候选 Markdown：\n"
        f"{candidate_markdown}\n"
    )


def _finalize_refined_markdown(base_markdown: str, candidate_markdown: str) -> str:
    rewritten_markdown = _normalize_refined_markdown_outline(candidate_markdown)
    rewritten_markdown = _normalize_ordered_list_numbering(rewritten_markdown)
    base_title = _extract_markdown_title(base_markdown)
    if base_title and not _extract_markdown_title(rewritten_markdown):
        rewritten_markdown = f"# {base_title}\n\n{rewritten_markdown}".strip()
    return rewritten_markdown
