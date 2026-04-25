import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database import db_service
from services.generation_session_service import teaching_brief_extractor
from services.generation_session_service.teaching_brief import (
    auto_apply_ai_proposal,
    build_teaching_brief_prompt_context,
    confirm_teaching_brief,
    load_teaching_brief,
    patch_teaching_brief,
    store_teaching_brief,
)
from services.generation_session_service.teaching_brief_projection import (
    build_brief_prompt_hint,
)


def test_patch_teaching_brief_computes_readiness():
    brief = patch_teaching_brief(
        {},
        {
            "topic": "分数加减法",
            "audience": "五年级学生",
            "target_pages": 12,
            "knowledge_points": ["同分母分数加法", "异分母分数通分"],
        },
    )

    assert brief["status"] == "live"
    assert brief["readiness"]["can_generate"] is True
    assert brief["readiness"]["missing_fields"] == []


def test_confirm_teaching_brief_marks_review_timestamp():
    brief = confirm_teaching_brief(
        {
            "topic": "分数加减法",
            "audience": "五年级学生",
            "target_pages": 12,
            "knowledge_points": ["同分母分数加法"],
        }
    )

    assert brief["status"] == "live"
    assert isinstance(brief["last_reviewed_at"], str)


def test_build_brief_prompt_hint_reads_from_session_options():
    options = store_teaching_brief(
        {},
        brief={
            "topic": "分数加减法",
            "audience": "五年级学生",
            "target_pages": 12,
            "knowledge_points": ["同分母分数加法", "异分母分数通分"],
        },
    )

    hint = build_brief_prompt_hint(options)
    loaded = load_teaching_brief(options)

    assert "教学主题：分数加减法" in hint
    assert "目标受众：五年级学生" in hint
    assert loaded["topic"] == "分数加减法"


def test_build_teaching_brief_prompt_context_exposes_missing_fields():
    options = store_teaching_brief(
        {},
        brief={
            "topic": "牛顿第二定律",
            "audience": "高一学生",
        },
    )

    context = build_teaching_brief_prompt_context(options)

    assert context["can_generate"] is False
    assert "knowledge_points" in context["missing_fields"]
    assert context["brief"]["topic"] == "牛顿第二定律"


def test_auto_apply_ai_proposal_updates_brief_without_queueing():
    result = auto_apply_ai_proposal(
        {},
        {
            "proposed_changes": {
                "topic": "牛顿第二定律",
                "audience": "高一学生",
            },
            "requires_user_confirmation": False,
        },
    )

    assert result["applied_fields"] == ["topic", "audience"]
    assert result["brief"]["status"] == "live"
    assert result["brief"]["topic"] == "牛顿第二定律"
    assert result["brief"]["audience"] == "高一学生"


def test_auto_apply_ai_proposal_overwrites_live_brief_without_stale_state():
    result = auto_apply_ai_proposal(
        {
            "topic": "牛顿第一定律",
            "audience": "高一学生",
            "target_pages": 12,
            "knowledge_points": ["惯性", "受力与运动"],
        },
        {
            "proposed_changes": {
                "topic": "牛顿第二定律",
            },
            "requires_user_confirmation": False,
        },
    )

    assert result["applied_fields"] == ["topic"]
    assert result["brief"]["status"] == "live"
    assert result["brief"]["topic"] == "牛顿第二定律"


def test_auto_apply_ai_proposal_can_queue_confirmation_required_proposal():
    result = auto_apply_ai_proposal(
        {"topic": "牛顿第二定律"},
        {
            "proposal_id": "proposal-1",
            "proposed_changes": {"audience": "高一学生"},
            "requires_user_confirmation": True,
        },
        proposals_raw=[],
    )

    assert result["applied_fields"] == []
    assert result["brief"]["topic"] == "牛顿第二定律"
    assert result["queued_proposal"]["proposal_id"] == "proposal-1"
    assert result["proposals"][0]["proposed_changes"] == {"audience": "高一学生"}


@pytest.mark.asyncio
async def test_background_extraction_can_update_reviewed_brief(monkeypatch):
    reviewed_options = store_teaching_brief(
        {},
        brief={
            "topic": "牛顿第二定律",
            "audience": "高一学生",
            "target_pages": 12,
            "knowledge_points": ["受力分析", "加速度与合力"],
            "last_reviewed_at": "2026-04-21T00:00:00+00:00",
        },
    )
    find_unique = AsyncMock(
        return_value=SimpleNamespace(
            id="session-1",
            projectId="project-1",
            options=json.dumps(reviewed_options, ensure_ascii=False),
            state="CONFIGURING",
        )
    )
    update_mock = AsyncMock()
    monkeypatch.setattr(
        db_service,
        "_instance",
        SimpleNamespace(
            db=SimpleNamespace(
                generationsession=SimpleNamespace(
                    find_unique=find_unique,
                    update=update_mock,
                )
            ),
            get_recent_conversation_messages=AsyncMock(
                return_value=[
                    SimpleNamespace(role="user", content="主题改成牛顿第一定律")
                ]
            ),
        ),
    )
    extract_mock = AsyncMock(
        return_value={
            "fields": {"topic": "牛顿第一定律"},
            "confidence": 0.92,
        }
    )
    monkeypatch.setattr(
        teaching_brief_extractor,
        "extract_brief_from_conversation",
        extract_mock,
    )

    await teaching_brief_extractor.run_background_brief_extraction(
        session_id="session-1",
        project_id="project-1",
    )

    extract_mock.assert_awaited_once()
    update_mock.assert_awaited_once()
