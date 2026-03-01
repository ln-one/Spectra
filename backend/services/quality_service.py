"""
Quality Service - 课件生成质量评估

检查内容完整性、字数合理性、结构一致性，返回质量报告。
"""

import logging
import re
from typing import Optional

from pydantic import BaseModel, Field

from schemas.outline import CoursewareOutline

logger = logging.getLogger(__name__)

MAX_WORDS_PER_SLIDE = 200


class QualityIssue(BaseModel):
    """单条质量问题"""

    level: str = Field(..., pattern="^(error|warning|info)$")
    slide_index: Optional[int] = None
    message: str


class QualityReport(BaseModel):
    """质量评估报告"""

    score: float = Field(..., ge=0, le=100)
    issues: list[QualityIssue] = Field(default_factory=list)
    summary: str = ""


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
    """
    对课件内容进行自动质量检查

    检查项：
    1. 每页是否有标题和内容
    2. 单页字数是否超过 MAX_WORDS_PER_SLIDE
    3. 大纲与实际内容的结构一致性
    """
    from services.courseware_ai import CoursewareAIMixin

    issues: list[QualityIssue] = []
    slides = CoursewareAIMixin.parse_marp_slides(markdown_content)

    if not slides:
        return QualityReport(
            score=0,
            issues=[QualityIssue(level="error", message="未检测到任何幻灯片")],
            summary="课件内容为空",
        )

    # 1. 内容完整性
    for s in slides:
        idx = s["index"]
        if not s["title"]:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=idx,
                    message=f"第 {idx + 1} 页缺少标题",
                )
            )
        content_lines = [
            line.strip()
            for line in s["content"].splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        if not content_lines:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=idx,
                    message=f"第 {idx + 1} 页缺少正文内容",
                )
            )

    # 2. 字数合理性
    for s in slides:
        word_count = _count_chinese_words(s["content"])
        if word_count > MAX_WORDS_PER_SLIDE:
            issues.append(
                QualityIssue(
                    level="warning",
                    slide_index=s["index"],
                    message=(
                        f"第 {s['index'] + 1} 页字数过多"
                        f"（{word_count}/{MAX_WORDS_PER_SLIDE}）"
                    ),
                )
            )

    # 3. 结构一致性（与大纲对比）
    if outline:
        expected_slides = outline.total_slides
        actual_slides = len(slides)
        diff = abs(expected_slides - actual_slides)
        if diff > 3:
            issues.append(
                QualityIssue(
                    level="warning",
                    message=(
                        f"实际页数（{actual_slides}）与大纲预期"
                        f"（{expected_slides}）差异较大"
                    ),
                )
            )

        # 检查大纲章节标题是否在 slides 中出现
        slide_titles = {s["title"].lower() for s in slides if s["title"]}
        for section in outline.sections:
            found = any(section.title.lower() in t for t in slide_titles)
            if not found:
                issues.append(
                    QualityIssue(
                        level="info",
                        message=f"大纲章节「{section.title}」未在幻灯片标题中找到",
                    ),
                )

    # 4. 教案检查
    if not lesson_plan_markdown.strip():
        issues.append(QualityIssue(level="warning", message="教案内容为空"))

    # 计算分数
    error_count = sum(1 for i in issues if i.level == "error")
    warning_count = sum(1 for i in issues if i.level == "warning")
    score = max(0, 100 - error_count * 20 - warning_count * 5)

    summary = f"共 {len(slides)} 页幻灯片"
    if issues:
        summary += f"，发现 {len(issues)} 个问题"
    else:
        summary += "，质量良好"

    return QualityReport(score=score, issues=issues, summary=summary)
