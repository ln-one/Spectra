from __future__ import annotations

import re
from typing import Optional

from schemas.outline import CoursewareOutline
from services.quality_service.models import QualityIssue, QualityReport

MAX_WORDS_PER_SLIDE = 200


def _count_chinese_words(text: str) -> int:
    """估算中英文混合文本的字数"""
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_words = len(re.findall(r"[a-zA-Z]+", text))
    return chinese + english_words


def check_quality(
    markdown_content: str,
    lesson_plan_markdown: str = "",
    outline: Optional[CoursewareOutline] = None,
) -> QualityReport:
    """对课件内容进行自动质量检查。"""
    from services.marp_utils import parse_marp_slides

    issues: list[QualityIssue] = []
    slides = parse_marp_slides(markdown_content)

    if not slides:
        return QualityReport(
            score=0,
            issues=[QualityIssue(level="error", message="未检测到任何幻灯片")],
            summary="课件内容为空",
        )

    for slide in slides:
        slide_index = slide["index"]
        if not slide["title"]:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=slide_index,
                    message=f"第 {slide_index + 1} 页缺少标题",
                )
            )
        content_lines = [
            line.strip()
            for line in slide["content"].splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        if not content_lines:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=slide_index,
                    message=f"第 {slide_index + 1} 页缺少正文内容",
                )
            )

    for slide in slides:
        word_count = _count_chinese_words(slide["content"])
        if word_count > MAX_WORDS_PER_SLIDE:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=slide["index"],
                    message=(
                        f"第 {slide['index'] + 1} 页字数过多"
                        f"（{word_count}/{MAX_WORDS_PER_SLIDE}）"
                    ),
                )
            )

    if outline:
        if outline.total_slides is not None:
            expected_slides = outline.total_slides
            actual_slides = len(slides)
            if abs(expected_slides - actual_slides) > 3:
                issues.append(
                    QualityIssue(
                        level="warning",
                        message=(
                            f"实际页数（{actual_slides}）与大纲预期"
                            f"（{expected_slides}）差异较大"
                        ),
                    )
                )

        slide_titles = {slide["title"].lower() for slide in slides if slide["title"]}
        for section in outline.sections:
            found = any(section.title.lower() in title for title in slide_titles)
            if not found:
                issues.append(
                    QualityIssue(
                        level="info",
                        message=f"大纲章节「{section.title}」未在幻灯片标题中找到",
                    )
                )

    if not lesson_plan_markdown.strip():
        issues.append(QualityIssue(level="warning", message="教案内容为空"))

    error_count = sum(1 for issue in issues if issue.level == "error")
    warning_count = sum(1 for issue in issues if issue.level == "warning")
    score = max(0, 100 - error_count * 20 - warning_count * 5)

    summary = f"共 {len(slides)} 页幻灯片"
    summary += f"，发现 {len(issues)} 个问题" if issues else "，质量良好"
    return QualityReport(score=score, issues=issues, summary=summary)
