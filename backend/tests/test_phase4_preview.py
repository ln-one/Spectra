"""
Phase 4 测试 - 预览、修改、质量评估

测试 preview schemas、Marp 解析、modify intent、quality service。
使用 mock，不依赖真实 API。
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from routers.preview import router as preview_router
from schemas.intent import ModifyIntent, ModifyType
from schemas.outline import CoursewareOutline, OutlineSection
from schemas.preview import (
    ExportData,
    ExportFormat,
    ExportRequest,
    LessonPlan,
    ModifyRequest,
    ModifyResponse,
    RelatedSlide,
    Slide,
    SlideDetailData,
    SlidePlan,
    SourceReference,
    SourceType,
)
from services.ai import AIService
from services.courseware_ai import CoursewareAIMixin
from services.quality_service import QualityReport, check_quality
from utils.dependencies import get_current_user

# ============================================================
# Preview Schemas
# ============================================================


class TestPreviewSchemas:
    """preview schemas 验证"""

    def test_slide_creation(self):
        slide = Slide(id="s1", index=0, title="标题", content="内容")
        assert slide.id == "s1"
        assert slide.sources == []

    def test_slide_with_source(self):
        src = SourceReference(
            chunk_id="c1",
            source_type=SourceType.DOCUMENT,
            filename="test.pdf",
        )
        slide = Slide(id="s1", index=0, title="T", content="C", sources=[src])
        assert len(slide.sources) == 1
        assert slide.sources[0].source_type == SourceType.DOCUMENT

    def test_modify_request_validation(self):
        req = ModifyRequest(instruction="改标题")
        assert req.instruction == "改标题"
        assert req.target_slides is None

    def test_modify_request_too_long(self):
        with pytest.raises(Exception):
            ModifyRequest(instruction="x" * 2001)

    def test_modify_request_empty(self):
        with pytest.raises(Exception):
            ModifyRequest(instruction="")

    def test_modify_response(self):
        resp = ModifyResponse(modify_task_id="m1", status="completed")
        assert resp.status == "completed"

    def test_export_request_defaults(self):
        req = ExportRequest()
        assert req.format == ExportFormat.MARKDOWN
        assert req.include_sources is True

    def test_lesson_plan(self):
        plan = LessonPlan(
            teaching_objectives=["目标1"],
            slides_plan=[
                SlidePlan(slide_id="s1", teaching_goal="目标", teacher_script="讲解")
            ],
        )
        assert len(plan.slides_plan) == 1

    def test_related_slide_valid(self):
        rs = RelatedSlide(slide_id="s1", title="T", relation="previous")
        assert rs.relation == "previous"

    def test_related_slide_invalid_relation(self):
        with pytest.raises(Exception):
            RelatedSlide(slide_id="s1", title="T", relation="invalid")

    def test_slide_detail_data(self):
        slide = Slide(id="s1", index=0, title="T", content="C")
        data = SlideDetailData(slide=slide)
        assert data.teaching_plan is None
        assert data.related_slides == []

    def test_export_data(self):
        data = ExportData(content="test", format="json")
        assert data.format == "json"


# ============================================================
# Marp Slide Parsing
# ============================================================

SAMPLE_MARP = """---
marp: true
theme: default
paginate: true
---

# 标题页
副标题

---

# 学习目标

- 目标1
- 目标2

---

# 核心内容

详细内容...

---

# 总结

回顾要点
"""


class TestMarpParsing:
    """parse_marp_slides / _extract_frontmatter / _reassemble_marp"""

    def test_parse_basic(self):
        slides = CoursewareAIMixin.parse_marp_slides(SAMPLE_MARP)
        assert len(slides) == 4
        assert slides[0]["title"] == "标题页"
        assert slides[1]["title"] == "学习目标"
        assert slides[3]["title"] == "总结"

    def test_parse_preserves_content(self):
        slides = CoursewareAIMixin.parse_marp_slides(SAMPLE_MARP)
        assert "目标1" in slides[1]["content"]
        assert "详细内容" in slides[2]["content"]

    def test_parse_empty(self):
        slides = CoursewareAIMixin.parse_marp_slides("")
        assert slides == []

    def test_parse_no_frontmatter(self):
        md = "# Page 1\n\ncontent\n\n---\n\n# Page 2\n\nmore"
        slides = CoursewareAIMixin.parse_marp_slides(md)
        assert len(slides) == 2

    def test_extract_frontmatter(self):
        fm = CoursewareAIMixin._extract_frontmatter(SAMPLE_MARP)
        assert "marp: true" in fm

    def test_extract_frontmatter_missing(self):
        fm = CoursewareAIMixin._extract_frontmatter("# No frontmatter")
        assert fm == ""

    def test_reassemble_marp(self):
        fm = "---\nmarp: true\n---"
        slides = ["# Page 1\n\ncontent", "# Page 2\n\nmore"]
        result = CoursewareAIMixin._reassemble_marp(fm, slides)
        assert "---\nmarp: true\n---" in result
        assert "# Page 1" in result
        assert "# Page 2" in result

    def test_parse_indices_sequential(self):
        slides = CoursewareAIMixin.parse_marp_slides(SAMPLE_MARP)
        indices = [s["index"] for s in slides]
        assert indices == [0, 1, 2, 3]


# ============================================================
# Modify Intent Parsing (keyword fallback)
# ============================================================


class TestModifyIntentKeywords:
    """_parse_modify_intent_by_keywords 测试"""

    def test_content_modify(self):
        result = AIService._parse_modify_intent_by_keywords("把标题改成xxx")
        assert result.modify_type == ModifyType.CONTENT

    def test_style_modify(self):
        result = AIService._parse_modify_intent_by_keywords("换一个模板风格")
        assert result.modify_type == ModifyType.STYLE

    def test_style_theme_color_not_global(self):
        result = AIService._parse_modify_intent_by_keywords("把主题色改成蓝色")
        assert result.modify_type == ModifyType.STYLE

    def test_structure_modify(self):
        result = AIService._parse_modify_intent_by_keywords("添加一页关于总结的内容")
        assert result.modify_type == ModifyType.STRUCTURE

    def test_global_modify(self):
        result = AIService._parse_modify_intent_by_keywords("整体改成学术风格")
        assert result.modify_type == ModifyType.GLOBAL

    def test_extract_page_number(self):
        result = AIService._parse_modify_intent_by_keywords("把第3页的标题改成xxx")
        assert result.target_slides == [3]
        assert result.modify_type == ModifyType.CONTENT

    def test_extract_multiple_pages(self):
        result = AIService._parse_modify_intent_by_keywords("修改第2页和第5页的内容")
        assert result.target_slides == [2, 5]

    def test_no_page_number(self):
        result = AIService._parse_modify_intent_by_keywords("改一下标题")
        assert result.target_slides is None

    def test_instruction_preserved(self):
        instruction = "把第1页标题改成Python入门"
        result = AIService._parse_modify_intent_by_keywords(instruction)
        assert result.instruction == instruction


# ============================================================
# Quality Service
# ============================================================


class TestQualityService:
    """check_quality 测试"""

    def test_good_quality(self):
        md = SAMPLE_MARP
        report = check_quality(md, "# 教学目标\n\n- 目标1")
        assert isinstance(report, QualityReport)
        assert report.score > 50

    def test_empty_content(self):
        report = check_quality("")
        assert report.score == 0
        assert any("未检测到" in i.message for i in report.issues)

    def test_missing_title_warning(self):
        md = "---\nmarp: true\n---\n\n内容没有标题\n\n---\n\n# 有标题\n\n内容"
        report = check_quality(md)
        assert any("缺少标题" in i.message for i in report.issues)

    def test_word_count_warning(self):
        long_content = "# 标题\n\n" + "这是很长的内容。" * 50
        md = f"---\nmarp: true\n---\n\n{long_content}"
        report = check_quality(md)
        assert any("字数过多" in i.message for i in report.issues)

    def test_empty_lesson_plan_warning(self):
        report = check_quality(SAMPLE_MARP, "")
        assert any("教案内容为空" in i.message for i in report.issues)

    def test_outline_consistency(self):
        outline = CoursewareOutline(
            title="Test",
            sections=[
                OutlineSection(
                    title="不存在的章节",
                    key_points=["x"],
                    slide_count=3,
                ),
            ],
            total_slides=20,
        )
        report = check_quality(SAMPLE_MARP, "# 教学目标\n\n- 目标", outline)
        assert any("差异较大" in i.message for i in report.issues)
        assert any("未在幻灯片标题中找到" in i.message for i in report.issues)

    def test_score_calculation(self):
        report = check_quality(SAMPLE_MARP, "# 教学目标\n\n- 目标1")
        assert 0 <= report.score <= 100


# ============================================================
# Preview Helpers
# ============================================================


class TestPreviewHelpers:
    """build_slides / build_lesson_plan 测试"""

    def test_build_slides(self):
        from services.preview_helpers import build_slides

        slides = build_slides("task1", SAMPLE_MARP)
        assert len(slides) == 4
        assert slides[0].id == "task1-slide-0"
        assert slides[0].title == "标题页"
        assert len(slides[0].sources) == 1

    def test_build_lesson_plan(self):
        from services.preview_helpers import build_lesson_plan

        slides = [
            Slide(id="s0", index=0, title="标题", content="C"),
            Slide(id="s1", index=1, title="目标", content="C"),
        ]
        lp_md = "# 教学目标\n\n- 知识目标\n- 技能目标\n\n# 教学重点\n\n- 重点1"
        plan = build_lesson_plan(slides, lp_md)
        assert isinstance(plan, LessonPlan)
        assert "知识目标" in plan.teaching_objectives
        assert len(plan.slides_plan) == 2

    def test_build_lesson_plan_empty(self):
        from services.preview_helpers import build_lesson_plan

        plan = build_lesson_plan([], "")
        assert plan.teaching_objectives == []
        assert plan.slides_plan == []


# ============================================================
# Modify Courseware (mock LLM)
# ============================================================


class TestModifyCourseware:
    """modify_courseware 测试"""

    @pytest.mark.asyncio
    async def test_modify_with_target_slides(self):
        ai = AIService()
        modified_slide = "# 新标题\n\n新内容"
        with patch.object(
            ai,
            "generate",
            new_callable=AsyncMock,
            return_value={"content": modified_slide},
        ):
            result = await ai.modify_courseware(
                current_content=SAMPLE_MARP,
                instruction="把第1页标题改成新标题",
                target_slides=[1],
            )
        assert result.title is not None
        assert result.markdown_content is not None

    @pytest.mark.asyncio
    async def test_modify_full_content(self):
        ai = AIService()
        full_modified = (
            "---\nmarp: true\n---\n\n# 新标题\n\n新内容\n\n---\n\n# 总结\n\n完"
        )
        with patch.object(
            ai,
            "generate",
            new_callable=AsyncMock,
            return_value={"content": full_modified},
        ):
            result = await ai.modify_courseware(
                current_content=SAMPLE_MARP,
                instruction="整体改成学术风格",
                target_slides=None,
            )
        assert result.markdown_content is not None


# ============================================================
# Parse Modify Intent (mock LLM)
# ============================================================


class TestParseModifyIntent:
    """parse_modify_intent LLM 路径测试"""

    @pytest.mark.asyncio
    async def test_llm_parse_success(self):
        ai = AIService()
        mock_response = json.dumps({"modify_type": "content", "target_slides": [3]})
        with patch.object(
            ai,
            "generate",
            new_callable=AsyncMock,
            return_value={"content": mock_response},
        ):
            result = await ai.parse_modify_intent("把第3页标题改成xxx")
        assert isinstance(result, ModifyIntent)
        assert result.modify_type == ModifyType.CONTENT
        assert result.target_slides == [3]

    @pytest.mark.asyncio
    async def test_llm_parse_fallback(self):
        ai = AIService()
        with patch.object(
            ai,
            "generate",
            new_callable=AsyncMock,
            side_effect=Exception("LLM error"),
        ):
            result = await ai.parse_modify_intent("把第3页标题改成xxx")
        assert isinstance(result, ModifyIntent)
        assert result.target_slides == [3]

    @pytest.mark.asyncio
    async def test_llm_parse_and_keyword_fallback_both_fail_returns_safe_default(self):
        ai = AIService()
        with patch.object(
            ai,
            "generate",
            new_callable=AsyncMock,
            side_effect=Exception("LLM error"),
        ):
            with patch.object(
                AIService,
                "_parse_modify_intent_by_keywords",
                side_effect=Exception("fallback error"),
            ):
                result = await ai.parse_modify_intent("把第3页标题改成xxx")
        assert isinstance(result, ModifyIntent)
        assert result.modify_type == ModifyType.CONTENT
        assert result.target_slides is None


# ============================================================
# Preview Router Validation
# ============================================================


class TestPreviewRouterValidation:
    """preview router 请求体验证测试"""

    def test_modify_preview_invalid_target_slides_returns_422(self):
        app = FastAPI()
        app.include_router(preview_router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: "u-001"
        try:
            with TestClient(app) as client:
                resp = client.post(
                    "/api/v1/preview/task-123/modify",
                    json={
                        "instruction": "修改内容",
                        "target_slides": ["abc"],
                    },
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert resp.status_code == 422
