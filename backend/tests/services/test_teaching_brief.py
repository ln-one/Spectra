from services.generation_session_service.teaching_brief import (
    auto_apply_ai_proposal,
    build_teaching_brief_prompt_context,
    build_brief_prompt_hint,
    confirm_teaching_brief,
    infer_teaching_brief_proposal,
    load_teaching_brief,
    patch_teaching_brief,
    store_teaching_brief,
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
        next_status="review_pending",
    )

    assert brief["status"] == "review_pending"
    assert brief["readiness"]["can_generate"] is True
    assert brief["readiness"]["missing_fields"] == []


def test_confirm_teaching_brief_marks_timestamp():
    brief = confirm_teaching_brief(
        {
            "topic": "分数加减法",
            "audience": "五年级学生",
            "target_pages": 12,
            "knowledge_points": ["同分母分数加法"],
        }
    )

    assert brief["status"] == "confirmed"
    assert isinstance(brief["last_confirmed_at"], str)


def test_infer_teaching_brief_proposal_extracts_structured_fields():
    proposal = infer_teaching_brief_proposal(
        content="这节课主题是分数加减法，面向五年级学生，做12页PPT，知识点包括同分母加法、异分母通分。",
        source_message_id="msg-1",
    )

    assert proposal is not None
    assert proposal["source_message_id"] == "msg-1"
    assert proposal["proposed_changes"]["topic"] == "分数加减法"
    assert proposal["proposed_changes"]["audience"] == "五年级学生"
    assert proposal["proposed_changes"]["target_pages"] == 12


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


def test_build_teaching_brief_prompt_context_exposes_status_and_missing_fields():
    options = store_teaching_brief(
        {},
        brief={
            "topic": "牛顿第二定律",
            "audience": "高一学生",
            "status": "review_pending",
        },
    )

    context = build_teaching_brief_prompt_context(options)

    assert context["status"] == "review_pending"
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
            }
        },
    )

    assert result["applied_fields"] == ["topic", "audience"]
    assert result["brief"]["status"] == "review_pending"
    assert result["brief"]["topic"] == "牛顿第二定律"
    assert result["brief"]["audience"] == "高一学生"


def test_auto_apply_ai_proposal_marks_confirmed_brief_as_stale_on_conflict():
    result = auto_apply_ai_proposal(
        {
            "status": "confirmed",
            "topic": "牛顿第一定律",
            "audience": "高一学生",
            "target_pages": 12,
            "knowledge_points": ["惯性", "受力与运动"],
        },
        {
            "proposed_changes": {
                "topic": "牛顿第二定律",
            }
        },
    )

    assert result["applied_fields"] == ["topic"]
    assert result["brief"]["status"] == "stale"
    assert result["brief"]["topic"] == "牛顿第二定律"
