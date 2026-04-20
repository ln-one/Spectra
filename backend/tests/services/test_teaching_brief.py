from services.generation_session_service.teaching_brief import (
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
