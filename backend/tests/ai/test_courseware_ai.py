"""Regression tests for removed legacy courseware chain APIs."""

import pytest

from services.ai import AIService


class TestLegacyCoursewareChainRemoved:
    @pytest.mark.asyncio
    async def test_generate_outline_removed(self):
        ai = AIService()
        with pytest.raises(
            RuntimeError,
            match=(
                "legacy_courseware_chain_removed: outline generation "
                "must run via Diego."
            ),
        ):
            await ai.generate_outline("proj1", "测试")

    @pytest.mark.asyncio
    async def test_generate_courseware_content_removed(self):
        ai = AIService()
        with pytest.raises(
            RuntimeError,
            match=(
                "legacy_courseware_chain_removed: courseware content generation "
                "must run via Diego."
            ),
        ):
            await ai.generate_courseware_content(
                project_id="proj1",
                user_requirements="测试",
            )

    @pytest.mark.asyncio
    async def test_extract_structured_content_removed(self):
        ai = AIService()
        with pytest.raises(
            RuntimeError,
            match=(
                "legacy_courseware_chain_removed: structured content extraction "
                "must run via Diego."
            ),
        ):
            await ai.extract_structured_content("proj1", "测试")

    @pytest.mark.asyncio
    async def test_modify_courseware_removed(self):
        ai = AIService()
        with pytest.raises(
            RuntimeError,
            match="legacy_courseware_chain_removed: slide modify must run via Diego.",
        ):
            await ai.modify_courseware(current_content="# demo", instruction="更新")

    def test_fallback_outline_removed(self):
        with pytest.raises(
            RuntimeError,
            match="legacy_courseware_chain_removed: fallback outline is removed.",
        ):
            AIService._get_fallback_outline("测试课件")

    def test_parse_courseware_response_removed(self):
        ai = AIService()
        with pytest.raises(
            RuntimeError,
            match=(
                "legacy_courseware_chain_removed: "
                "courseware response parsing is removed."
            ),
        ):
            ai._parse_courseware_response("# demo", "测试")
