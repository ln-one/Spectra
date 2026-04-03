"""课件内容解析、清洗与结构修正工具。"""

import json
import logging
import re

from schemas.generation import CoursewareContent

logger = logging.getLogger(__name__)


def parse_render_rewrite_response(content: str) -> str:
    """
    解析 render rewrite 响应，返回完整 Marp 文档

    Args:
        content: LLM 响应内容

    Returns:
        完整 Marp 文档字符串

    Raises:
        ValueError: 校验失败
    """
    # 去除可能的代码块包装
    normalized = strip_outer_code_fence(content)

    # 校验必需元素
    if "marp: true" not in normalized:
        raise ValueError("Missing 'marp: true' in frontmatter")

    if "<style>" not in normalized or "</style>" not in normalized:
        raise ValueError("Missing <style> block")

    # 校验至少有一个 slide（除了 frontmatter 和 style）
    slides = re.split(r"\n---\n", normalized)
    if len(slides) < 2:  # frontmatter + 至少 1 个 slide
        raise ValueError("No slides found after frontmatter")

    # 安全检查：禁止危险 CSS 模式
    dangerous_patterns = ["@import", "@font-face", "url(http"]
    content_lower = normalized.lower()
    for pattern in dangerous_patterns:
        if pattern in content_lower:
            logger.warning(f"Dangerous CSS pattern detected: {pattern}, sanitizing")
            # 移除整个 style 块中的危险行
            normalized = _sanitize_dangerous_css(normalized, dangerous_patterns)

    return normalized


def _sanitize_dangerous_css(content: str, patterns: list[str]) -> str:
    """移除 style 块中的危险 CSS 模式"""
    style_match = re.search(r"<style>(.*?)</style>", content, re.DOTALL)
    if not style_match:
        return content

    style_content = style_match.group(1)
    lines = style_content.split("\n")
    safe_lines = []

    for line in lines:
        line_lower = line.lower()
        if any(pattern in line_lower for pattern in patterns):
            continue
        safe_lines.append(line)

    safe_style = "\n".join(safe_lines)
    return content.replace(style_match.group(0), f"<style>{safe_style}</style>")


def parse_style_generation_response(content: str) -> dict:
    """解析样式生成阶段的 JSON 响应"""
    try:
        # 尝试提取 JSON
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            raise ValueError("No JSON found in response")

        data = json.loads(json_match.group(0))

        # 验证必需字段
        if "style_manifest" not in data or "page_class_plan" not in data:
            raise ValueError("Missing required fields in style response")

        # 清洗 extra_css
        extra_css = data.get("extra_css", "")
        if extra_css:
            extra_css = _sanitize_extra_css(extra_css)
            data["extra_css"] = extra_css

        return data

    except Exception as e:
        logger.warning(f"Failed to parse style response: {e}")
        return {}


def _sanitize_extra_css(css: str) -> str:
    """清洗 extra_css，移除危险模式"""
    if not css:
        return ""

    css_lower = css.lower()
    forbidden = ["@import", "@font-face", "url(http"]
    for pattern in forbidden:
        if pattern in css_lower:
            logger.warning(f"Forbidden CSS pattern detected: {pattern}, discarding")
            return ""

    # 长度限制
    if len(css) > 5000:
        logger.warning("extra_css too long, truncating")
        css = css[:5000]

    return css


def parse_marp_slides(markdown_content: str) -> list[dict]:
    """把 Marp Markdown 拆成逐页 slide 列表。"""
    content = sanitize_ppt_markdown(markdown_content).strip()
    frontmatter_match = re.match(r"^---\s*\n[\s\S]*?\n---\s*\n?", content)
    if frontmatter_match:
        content = content[frontmatter_match.end() :]

    raw_slides = re.split(r"\n---\s*\n", content)
    slides: list[dict] = []
    for index, raw in enumerate(raw_slides):
        raw = raw.strip()
        if not raw:
            continue
        title_match = re.match(r"^#\s+(.+)$", raw, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""
        slides.append({"index": index, "title": title, "content": raw})
    return slides


def reassemble_marp(frontmatter: str, slides: list[str]) -> str:
    """把 frontmatter 与 slides 重新拼成 Marp Markdown。"""
    parts = [frontmatter.strip()] if frontmatter.strip() else []
    parts.extend(slide.strip() for slide in slides if slide.strip())
    return "\n\n---\n\n".join(parts) + "\n"


def extract_frontmatter(markdown_content: str) -> str:
    """提取 Marp frontmatter。"""
    frontmatter_match = re.match(r"^(---\s*\n[\s\S]*?\n---)\s*\n?", markdown_content)
    return frontmatter_match.group(1) if frontmatter_match else ""


def parse_courseware_response(
    ai_service,
    content: str,
    user_requirements: str,
) -> CoursewareContent:
    """解析 LLM 返回的课件内容。"""
    normalized_content = strip_outer_code_fence(content)
    ppt_content = extract_block(
        normalized_content,
        "PPT_CONTENT_START",
        "PPT_CONTENT_END",
    )
    lesson_plan = extract_block(
        normalized_content,
        "LESSON_PLAN_START",
        "LESSON_PLAN_END",
    )

    if not ppt_content or not lesson_plan:
        logger.warning("Failed to parse strict markers, trying heuristic split")
        heuristic_ppt, heuristic_lesson = heuristic_split_sections(normalized_content)
        ppt_content = ppt_content or heuristic_ppt
        lesson_plan = lesson_plan or heuristic_lesson

    ppt_content = sanitize_ppt_markdown(ppt_content)
    lesson_plan = sanitize_marker_lines(lesson_plan)

    title_match = re.search(r"^#\s+(.+)$", ppt_content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else user_requirements[:50]

    if not ppt_content:
        logger.warning("PPT content is empty, using fallback")
        ppt_content = (
            f"# {title}\n\nCourseware is being prepared...\n\n---\n\n"
            "# Summary\n\nThank you"
        )

    if not lesson_plan:
        logger.warning("Lesson plan is empty, using fallback")
        lesson_plan = (
            f"# 教学目标\n\n- 完成《{title}》教学设计\n"
            "# 教学过程\n\n## 教学环节\n\n内容待补充"
        )

    return CoursewareContent(
        title=title,
        markdown_content=ppt_content,
        lesson_plan_markdown=lesson_plan,
    )


def strip_outer_code_fence(content: str) -> str:
    """去掉最外层 Markdown 代码块包装（支持多层嵌套）。"""
    stripped = content.strip()

    # 循环去除外层 fence，直到没有匹配
    while True:
        fence_match = re.match(
            r"^\s*```(?:markdown|md|marp)?\s*\n(.*?)\n```\s*$",
            stripped,
            re.DOTALL | re.IGNORECASE,
        )
        if fence_match:
            stripped = fence_match.group(1).strip()
        else:
            break

    return stripped


def extract_block(content: str, start_tag: str, end_tag: str) -> str:
    """提取带标记边界的内容块。"""
    pattern = (
        rf"(?is)(?:^|\n)\s*(?:=+\s*)?{re.escape(start_tag)}(?:\s*=+)?\s*(?:\n|$)"
        rf"(.*?)"
        rf"(?:^|\n)\s*(?:=+\s*)?{re.escape(end_tag)}(?:\s*=+)?\s*(?:\n|$)"
    )
    match = re.search(pattern, content, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def sanitize_marker_lines(content: str) -> str:
    if not content:
        return ""
    cleaned = re.sub(
        (
            r"(?im)^\s*(?:=+\s*)?"
            r"(PPT_CONTENT_START|PPT_CONTENT_END|LESSON_PLAN_START|LESSON_PLAN_END)"
            r"(?:\s*=+)?\s*$"
        ),
        "",
        content,
    )
    cleaned = re.sub(
        (
            r"(?i)(?:=+\s*)?"
            r"(PPT_CONTENT_START|PPT_CONTENT_END|LESSON_PLAN_START|LESSON_PLAN_END)"
            r"(?:\s*=+)?"
        ),
        "",
        cleaned,
    )
    return cleaned.strip()


def sanitize_ppt_markdown(content: str) -> str:
    cleaned = sanitize_marker_lines(content)
    if not cleaned:
        return ""

    cleaned = strip_outer_code_fence(cleaned)
    cleaned = sanitize_marker_lines(cleaned)

    frontmatter_match = re.search(
        r"---\s*\n[\s\S]*?marp:\s*true[\s\S]*?\n---\s*\n?",
        cleaned,
        re.IGNORECASE,
    )
    if frontmatter_match and frontmatter_match.start() > 0:
        prefix = cleaned[: frontmatter_match.start()].strip()
        if prefix and not re.search(r"(?m)^\s*#\s+", prefix):
            cleaned = cleaned[frontmatter_match.start() :]

    return cleaned.strip()


def enforce_outline_structure(markdown_content: str, outline_document: dict) -> str:
    nodes = (outline_document or {}).get("nodes") or []
    if not nodes:
        return sanitize_ppt_markdown(markdown_content)

    sorted_nodes = sorted(nodes, key=lambda item: item.get("order", 0))
    sanitized = sanitize_ppt_markdown(markdown_content)
    frontmatter = extract_frontmatter(sanitized)
    parsed_slides = parse_marp_slides(sanitized)

    rebuilt_slides: list[str] = []
    for index, node in enumerate(sorted_nodes):
        expected_title = str(node.get("title") or f"Slide {index + 1}").strip()
        key_points = [
            str(point).strip()
            for point in (node.get("key_points") or [])
            if str(point).strip()
        ]
        existing = parsed_slides[index]["content"] if index < len(parsed_slides) else ""
        rebuilt_slides.append(
            normalize_slide_with_outline(existing, expected_title, key_points)
        )

    return reassemble_marp(frontmatter, rebuilt_slides)


def normalize_slide_with_outline(
    content: str,
    expected_title: str,
    key_points: list[str],
) -> str:
    body = (content or "").strip()
    if body:
        if re.search(r"(?m)^\s*#\s+.+$", body):
            body = re.sub(
                r"(?m)^\s*#\s+.+$",
                f"# {expected_title}",
                body,
                count=1,
            )
        else:
            body = f"# {expected_title}\n\n{body}".strip()
    else:
        body = f"# {expected_title}"

    non_empty_lines = [line for line in body.splitlines() if line.strip()]
    if key_points:
        body_without_title = re.sub(r"(?m)^\s*#\s+.+\n?", "", body, count=1).strip()
        body_lower = body_without_title.lower()
        has_outline_points = any(
            point.lower() in body_lower for point in key_points if point.strip()
        )
        if not has_outline_points:
            bullets = "\n".join(f"- {point}" for point in key_points[:5])
            body = f"# {expected_title}\n\n{bullets}"
            non_empty_lines = [line for line in body.splitlines() if line.strip()]

    if len(non_empty_lines) <= 2 and key_points:
        bullets = "\n".join(f"- {point}" for point in key_points[:5])
        body = f"# {expected_title}\n\n{bullets}"

    if not key_points and len(non_empty_lines) <= 1:
        body = f"# {expected_title}\n\n- 内容待补充"

    return body.strip()


def heuristic_split_sections(content: str) -> tuple[str, str]:
    """在缺少明确标记时，按启发式规则拆分课件与教案。"""
    lesson_heading = re.search(
        r"^\s*#\s*(教学目标|教案|Lesson Plan)\b.*$",
        content,
        re.MULTILINE | re.IGNORECASE,
    )
    if lesson_heading:
        split_index = lesson_heading.start()
        return content[:split_index].strip(), content[split_index:].strip()

    if re.search(r"^\s*---\s*\n[\s\S]*?marp:\s*true", content, re.IGNORECASE):
        return content.strip(), ""

    return "", content.strip()


def get_fallback_courseware(user_requirements: str) -> CoursewareContent:
    """课件生成失败时返回兜底课件内容。"""
    title = user_requirements[:50] if user_requirements else "课程主题"

    return CoursewareContent(
        title=title,
        markdown_content=(
            f"# {title}\n\n课程导入\n\n---\n\n"
            "# 学习目标\n\n"
            "- 理解核心概念\n"
            "- 掌握基础方法\n"
            "- 能够迁移应用\n\n---\n\n"
            "# 核心内容\n\n"
            "## 关键知识讲解\n\n"
            "内容讲解与示例。\n\n---\n\n"
            "# 课堂练习\n\n分层练习与互动。\n\n---\n\n"
            "# 课堂总结\n\n"
            "- 要点回顾\n"
            "- 作业布置\n"
            "- 下节预告\n"
        ),
        lesson_plan_markdown=(
            f"# 教学目标\n\n"
            f"- 知识目标：理解 {title} 的核心知识\n"
            "- 能力目标：能够运用相关方法解决问题\n"
            "- 情感目标：建立学习兴趣与主动性\n\n"
            "# 教学重点\n\n"
            "- 核心概念理解\n"
            "- 方法应用迁移\n\n"
            "# 教学难点\n\n"
            "- 深层理解与举一反三\n"
            "- 情境化应用\n\n"
            "# 教学过程\n\n"
            "## 导入（5分钟）\n\n"
            "创设情境，激发兴趣。\n\n"
            "## 讲授（25分钟）\n\n"
            "讲解核心知识并示例演示。\n\n"
            "## 练习（10分钟）\n\n"
            "分层练习与点评。\n\n"
            "## 总结（5分钟）\n\n"
            "回顾要点并布置作业。\n\n"
            f"# 板书设计\n\n```\n{title}\n"
            "├─ 核心概念\n"
            "├─ 关键方法\n"
            "└─ 应用场景\n```\n\n"
            "# 作业布置\n\n"
            "1. 复习课堂内容\n"
            "2. 完成配套练习\n"
            "3. 预习下一课\n"
        ),
    )
