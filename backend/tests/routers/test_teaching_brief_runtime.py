import asyncio
import time

from routers.chat.teaching_brief_runtime import (
    GENERATION_ACTION_OPEN_GENERATION_CONFIRM,
    build_generation_confirm_draft,
    build_generation_intent_payload,
    detect_generation_intent,
    plan_brief_extraction,
    resolve_brief_extraction_idle_turns,
)


def test_detect_generation_intent_matches_courseware_start_request():
    assert detect_generation_intent("现在开始生成这套 PPT") is True
    assert detect_generation_intent("合理，开始吧") is True
    assert detect_generation_intent("就按这个方案生成") is True
    assert detect_generation_intent("先继续聊需求") is False


def test_build_generation_intent_payload_opens_confirm_for_live_brief():
    payload = build_generation_intent_payload(
        content="合理，开始吧",
        brief_raw={
            "status": "live",
            "topic": "光照模型",
            "audience": "软件工程大二学生",
            "lesson_hours": 5,
            "knowledge_points": ["Phong", "Blinn-Phong"],
        },
    )

    assert payload["generation_intent"] is True
    assert payload["generation_ready"] is True
    assert payload["generation_blocked_reason"] == ""
    assert payload["generation_action"] == GENERATION_ACTION_OPEN_GENERATION_CONFIRM


def test_build_generation_intent_payload_ignores_legacy_confirmed_status():
    payload = build_generation_intent_payload(
        content="开始生成 PPT",
        brief_raw={
            "status": "confirmed",
            "topic": "光照模型",
            "audience": "软件工程大二学生",
            "lesson_hours": 5,
            "knowledge_points": ["Phong", "Blinn-Phong"],
        },
    )

    assert payload["generation_ready"] is True
    assert payload["generation_action"] == GENERATION_ACTION_OPEN_GENERATION_CONFIRM


def test_build_generation_confirm_draft_defaults_page_count_to_eight(monkeypatch):
    async def _fake_generate(**_kwargs):
        return {
            "content": (
                '{"summary":"已整理完成。","prompt":"围绕图形学基础生成教学课件。",'
                '"config":{"prompt":"围绕图形学基础生成教学课件。","pageCount":8,'
                '"visualStyle":"academic","layoutMode":"smart","templateId":null,'
                '"visualPolicy":"auto"}}'
            )
        }

    monkeypatch.setattr(
        "routers.chat.teaching_brief_runtime.ai_service.generate",
        _fake_generate,
    )

    draft = asyncio.run(
        build_generation_confirm_draft(
            content="开始生成 PPT",
            brief_raw={
                "status": "live",
                "topic": "图形学基础",
                "audience": "软件工程大二学生",
                "lesson_hours": 12,
                "knowledge_points": ["直线生成算法"],
                "target_pages": None,
            },
            history_payload=[
                {"role": "user", "content": "生成一份教学大纲"},
                {"role": "assistant", "content": "请补充受众和课时"},
                {"role": "user", "content": "面向软件工程大二学生"},
                {"role": "assistant", "content": "好的，再说一下课时安排"},
                {"role": "user", "content": "用12个课时讲完"},
            ],
        )
    )

    assert draft is not None
    assert draft["config"]["pageCount"] == 8
    assert draft["config"]["layoutMode"] == "smart"


def test_build_generation_intent_payload_blocks_when_brief_missing_fields():
    payload = build_generation_intent_payload(
        content="开始生成 PPT",
        brief_raw={
            "status": "live",
            "topic": "光照模型",
            "readiness": {
                "missing_fields": ["audience"],
                "can_generate": False,
            },
        },
    )

    assert payload["generation_intent"] is True
    assert payload["generation_ready"] is False
    assert payload["generation_action"] is None
    assert payload["generation_blocked_reason"] == "教学需求单尚不完整：缺少受众、知识点、课时或页数"


def test_resolve_brief_extraction_idle_turns_defaults_to_four(monkeypatch):
    monkeypatch.delenv("BRIEF_EXTRACTION_IDLE_TURNS", raising=False)
    monkeypatch.delenv("BRIEF_EXTRACTION_INTERVAL", raising=False)

    assert resolve_brief_extraction_idle_turns() == 4


def test_plan_brief_extraction_triggers_after_four_idle_turns(monkeypatch):
    monkeypatch.delenv("BRIEF_EXTRACTION_IDLE_TURNS", raising=False)
    monkeypatch.delenv("BRIEF_EXTRACTION_INTERVAL", raising=False)

    plan = plan_brief_extraction(
        options_raw={"_brief_extraction_turn_count": 3},
        brief_raw={"status": "live"},
        latest_user_message="继续聊",
    )

    assert plan["should_run"] is True
    assert plan["interval_trigger"] is True
    assert plan["idle_fallback_trigger"] is True
    assert plan["idle_turns_without_extraction"] == 4
    assert plan["extraction_reason"] == "interval"
    assert plan["pending_turn_count"] == 0


def test_plan_brief_extraction_does_not_fallback_before_four_idle_turns(monkeypatch):
    monkeypatch.delenv("BRIEF_EXTRACTION_IDLE_TURNS", raising=False)
    monkeypatch.delenv("BRIEF_EXTRACTION_INTERVAL", raising=False)

    plan = plan_brief_extraction(
        options_raw={"_brief_extraction_turn_count": 2},
        brief_raw={"status": "live"},
        latest_user_message="继续聊",
    )

    assert plan["should_run"] is False
    assert plan["interval_trigger"] is False
    assert plan["idle_fallback_trigger"] is False
    assert plan["pending_turn_count"] == 3


def test_plan_brief_extraction_legacy_interval_env_still_supported(monkeypatch):
    monkeypatch.delenv("BRIEF_EXTRACTION_IDLE_TURNS", raising=False)
    monkeypatch.setenv("BRIEF_EXTRACTION_INTERVAL", "3")

    assert resolve_brief_extraction_idle_turns() == 3


def test_plan_brief_extraction_idle_turn_env_overrides_legacy_interval(monkeypatch):
    monkeypatch.setenv("BRIEF_EXTRACTION_INTERVAL", "3")
    monkeypatch.setenv("BRIEF_EXTRACTION_IDLE_TURNS", "5")

    assert resolve_brief_extraction_idle_turns() == 5


def test_plan_brief_extraction_triggers_when_missing_duration_is_answered():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={
            "status": "live",
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
        brief_raw={"status": "live"},
        latest_user_message="好了，直接给我完整大纲吧",
    )

    assert plan["should_run"] is True
    assert plan["generation_intent_trigger"] is True
    assert plan["extraction_reason"] == "generation_intent"


def test_plan_brief_extraction_skips_when_brief_ready_to_start():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={
            "status": "live",
            "topic": "算法设计",
            "audience": "软件工程大二学生",
            "lesson_hours": 12,
            "knowledge_points": ["概念", "算法思路"],
            "readiness": {
                "missing_fields": [],
                "can_generate": True,
            },
        },
        latest_user_message="合理，开始吧",
    )

    assert plan["should_run"] is False
    assert plan["generation_intent_trigger"] is True
    assert plan["extraction_reason"] is None


def test_plan_brief_extraction_debounces_interval_trigger_after_recent_schedule():
    plan = plan_brief_extraction(
        options_raw={
            "_brief_extraction_last_scheduled_at": 9999999999,
            "_brief_extraction_turn_count": 3,
        },
        brief_raw={
            "status": "live",
            "readiness": {
                "missing_fields": ["audience"],
                "can_generate": False,
            },
        },
        latest_user_message="继续聊",
    )

    assert plan["should_run"] is False
    assert plan["debounced"] is True
    assert plan["detected_reason"] == "interval"
    assert plan["extraction_reason"] is None


def test_plan_brief_extraction_does_not_debounce_missing_field_answer():
    plan = plan_brief_extraction(
        options_raw={"_brief_extraction_last_scheduled_at": time.time()},
        brief_raw={
            "status": "live",
            "readiness": {
                "missing_fields": ["audience"],
                "can_generate": False,
            },
        },
        latest_user_message="面向软件工程专业的大二学生",
    )

    assert plan["should_run"] is True
    assert plan["debounced"] is False
    assert plan["extraction_reason"] == "missing_field_answer"


def test_plan_brief_extraction_triggers_early_when_message_fills_most_gaps():
    plan = plan_brief_extraction(
        options_raw={},
        brief_raw={"status": "live"},
        latest_user_message="我要做牛顿第二定律，面向高一学生，知识点包括受力分析和加速度，做12页PPT。",
    )

    assert plan["should_run"] is True
    assert plan["immediate_trigger"] is True
    assert plan["extraction_reason"] == "missing_field_answer"
    assert plan["pending_turn_count"] == 0
