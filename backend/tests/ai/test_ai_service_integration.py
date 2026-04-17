import pytest

from services.ai import AIService


@pytest.mark.asyncio
async def test_generate_courseware_content_removed():
    ai_service = AIService()

    with pytest.raises(RuntimeError, match="legacy_courseware_chain_removed"):
        await ai_service.generate_courseware_content(
            project_id="test_proj_001",
            user_requirements="Python 基础编程",
            template_style="default",
        )


@pytest.mark.asyncio
async def test_generate_outline_removed():
    ai_service = AIService()

    with pytest.raises(RuntimeError, match="legacy_courseware_chain_removed"):
        await ai_service.generate_outline("proj1", "Python 入门")


@pytest.mark.asyncio
async def test_extract_structured_content_removed():
    ai_service = AIService()

    with pytest.raises(RuntimeError, match="legacy_courseware_chain_removed"):
        await ai_service.extract_structured_content("proj1", "测试需求")


def test_fallback_courseware_removed():
    ai_service = AIService()

    with pytest.raises(RuntimeError, match="legacy_courseware_chain_removed"):
        ai_service._get_fallback_courseware("测试主题")


def test_parse_courseware_response_removed():
    ai_service = AIService()

    with pytest.raises(RuntimeError, match="legacy_courseware_chain_removed"):
        ai_service._parse_courseware_response("# title", "测试课件")


def test_build_courseware_prompt_still_available():
    from services.prompt_service import prompt_service

    prompt = prompt_service.build_courseware_prompt("Python 编程基础", "default")

    assert "Python 编程基础" in prompt
    assert "PPT_CONTENT" in prompt
    assert "LESSON_PLAN" in prompt


def test_marp_helpers_still_available():
    ai_service = AIService()
    marp = """---
marp: true
---

# Slide 1

---

# Slide 2
"""

    slides = ai_service.parse_marp_slides(marp)
    assert len(slides) == 2

    frontmatter = ai_service._extract_frontmatter(marp)
    assert "marp: true" in frontmatter

    rebuilt = ai_service._reassemble_marp(frontmatter, ["# A", "# B"])
    assert "# A" in rebuilt
    assert "# B" in rebuilt
