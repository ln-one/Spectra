from routers.chat.teaching_brief_runtime import (
    build_generation_intent_payload,
    detect_generation_intent,
    plan_brief_extraction,
)


def test_detect_generation_intent_matches_courseware_start_request():
    assert detect_generation_intent("现在开始生成这套 PPT") is True
    assert detect_generation_intent("先继续聊需求") is False


def test_build_generation_intent_payload_blocks_when_brief_not_confirmed():
    payload = build_generation_intent_payload(
        content="开始生成 PPT",
        brief_raw={
            "status": "review_pending",
            "topic": "光照模型",
            "audience": "软件工程大二学生",
            "lesson_hours": 5,
            "knowledge_points": ["Phong", "Blinn-Phong"],
        },
    )

    assert payload["generation_intent"] is True
    assert payload["generation_ready"] is False
    assert payload["generation_blocked_reason"] == "请先确认教学需求单"


def test_plan_brief_extraction_triggers_on_interval(monkeypatch):
    monkeypatch.setenv("BRIEF_EXTRACTION_INTERVAL", "3")

    plan = plan_brief_extraction(
        options_raw={"_brief_extraction_turn_count": 2},
        brief_raw={"status": "draft"},
        latest_user_message="继续聊",
    )

    assert plan["should_run"] is True
    assert plan["interval_trigger"] is True
    assert plan["extraction_reason"] == "interval"
    assert plan["pending_turn_count"] == 0


def test_plan_brief_extraction_triggers_when_missing_duration_is_answered():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={
            "status": "review_pending",
            "topic": "算法",
            "audience": "软件工程大二学生",
            "knowledge_points": ["概念", "算法思路"],
            "readiness": {
                "missing_fields": ["duration_or_pages"],
                "can_generate": False,
            },
        },
        latest_user_message="安排12个课时，着重概念和算法思路，实验和代码暂不考虑",
    )

    assert plan["should_run"] is True
    assert plan["missing_field_answer_trigger"] is True
    assert plan["answered_missing_fields"] == ["duration_or_pages"]
    assert plan["extraction_reason"] == "missing_field_answer"
    assert plan["refresh_after_ms"] >= 500


def test_plan_brief_extraction_triggers_on_generation_intent():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={"status": "review_pending"},
        latest_user_message="好了，直接给我完整大纲吧",
    )

    assert plan["should_run"] is True
    assert plan["generation_intent_trigger"] is True
    assert plan["extraction_reason"] == "generation_intent"


def test_plan_brief_extraction_debounces_recent_schedule():
    plan = plan_brief_extraction(
        options_raw={"_brief_extraction_last_scheduled_at": 9999999999},
        brief_raw={
            "status": "draft",
            "readiness": {
                "missing_fields": ["audience"],
                "can_generate": False,
            },
        },
        latest_user_message="面向软件工程专业的大二学生",
    )

    assert plan["should_run"] is False
    assert plan["debounced"] is True
    assert plan["detected_reason"] == "missing_field_answer"
    assert plan["extraction_reason"] is None


def test_plan_brief_extraction_triggers_early_when_message_fills_most_gaps():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={"status": "draft"},
        latest_user_message="我要做牛顿第二定律，面向高一学生，知识点包括受力分析和加速度，做12页PPT。",
    )

    assert plan["should_run"] is True
    assert plan["immediate_trigger"] is True
    assert plan["extraction_reason"] == "missing_field_answer"
    assert plan["pending_turn_count"] == 0
