from __future__ import annotations

import pytest

from services.generation_session_service.game_template_engine import (
    TEMPLATE_GAME_PATTERNS,
    build_game_fallback_data,
    build_game_prompt,
    build_game_schema_hint,
    render_game_html,
    validate_game_data,
)


@pytest.mark.parametrize("pattern", TEMPLATE_GAME_PATTERNS)
def test_build_game_schema_hint_supports_all_patterns(pattern: str) -> None:
    hint = build_game_schema_hint(pattern)
    assert isinstance(hint, str)
    assert "game_title" in hint


@pytest.mark.parametrize("pattern", TEMPLATE_GAME_PATTERNS)
def test_build_game_prompt_includes_pattern_and_topic(pattern: str) -> None:
    prompt = build_game_prompt(
        pattern=pattern,
        config={"topic": "操作系统进程管理", "creative_brief": "突出互动闯关"},
        rag_snippets=["进程状态包括就绪、运行、阻塞"],
    )
    assert pattern in prompt
    assert "操作系统进程管理" in prompt
    assert "Do not output HTML/CSS/JS." in prompt


@pytest.mark.parametrize("pattern", TEMPLATE_GAME_PATTERNS)
def test_build_game_fallback_data_returns_valid_payload(pattern: str) -> None:
    payload = build_game_fallback_data(
        pattern=pattern,
        config={"topic": "进程调度", "life": 3},
        rag_snippets=["FCFS 与 RR 的差异"],
    )
    validate_game_data(pattern, payload)


@pytest.mark.parametrize("pattern", TEMPLATE_GAME_PATTERNS)
def test_render_game_html_injects_json_data(pattern: str) -> None:
    payload = build_game_fallback_data(
        pattern=pattern,
        config={"topic": "同步与互斥"},
        rag_snippets=[],
    )
    html = render_game_html(pattern, payload)
    assert isinstance(html, str)
    assert "__GAME_DATA__" not in html
    assert "const gameData =" in html
    assert "<html" in html


def test_validate_game_data_rejects_invalid_timeline_payload() -> None:
    with pytest.raises(ValueError, match="field_correct_order_unknown_id"):
        validate_game_data(
            "timeline_sort",
            {
                "game_title": "时间轴排序",
                "instruction": "排序事件",
                "events": [{"id": "evt-1", "label": "事件A", "year": "1900"}],
                "correct_order": ["evt-2"],
                "success_message": "成功",
                "retry_message": "重试",
            },
        )


def test_timeline_sort_template_hides_year_text_in_card_ui() -> None:
    payload = build_game_fallback_data(
        pattern="timeline_sort",
        config={"topic": "操作系统"},
        rag_snippets=[],
    )
    html = render_game_html("timeline_sort", payload)
    assert "event-year" not in html
    assert "event.label + \"</div><div class='event-year'>\"" not in html


def test_concept_match_template_randomizes_definitions_and_uses_color_links() -> None:
    payload = build_game_fallback_data(
        pattern="concept_match",
        config={"topic": "操作系统"},
        rag_snippets=[],
    )
    html = render_game_html("concept_match", payload)
    assert "definitionOrder" in html
    assert "colorPalette" in html
    assert "assignedColorByConcept" in html
