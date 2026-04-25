from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services import title_service
from services.generation_session_service.run_constants import build_pending_run_title
from services.title_service import service as title_service_module
from services.title_service.prompting import (
    build_default_project_title,
    build_default_session_title,
    build_run_pending_title,
    extract_run_context,
    extract_run_key_facts,
    normalize_effective_title,
)
from services.title_service.structured_prompting import build_session_title_payload
from services.title_service.structured_runtime import StructuredTitleResult
from services.title_service.structured_runtime import (
    TITLE_RESPONSE_MAX_TOKENS,
    generate_structured_title,
)


@pytest.mark.anyio
async def test_request_run_title_generation_claims_only_once(monkeypatch):
    update_many = AsyncMock(side_effect=[1, 0])
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(update_many=update_many),
    )
    spawned_labels: list[str] = []

    def _drop_task(coro, *, label: str) -> None:
        spawned_labels.append(label)
        if hasattr(coro, "close"):
            coro.close()

    monkeypatch.setattr(title_service, "spawn_background_task", _drop_task)

    first = await title_service.request_run_title_generation(
        db=db,
        run_id="run-001",
        tool_type="ppt_generate",
        snapshot={"topic": "线性回归"},
    )
    second = await title_service.request_run_title_generation(
        db=db,
        run_id="run-001",
        tool_type="ppt_generate",
        snapshot={"topic": "线性回归"},
    )

    assert first is True
    assert second is False
    assert update_many.await_count == 2
    assert spawned_labels == ["run-title:run-001"]


@pytest.mark.anyio
async def test_request_run_title_generation_keeps_default_pending_title(monkeypatch):
    run = SimpleNamespace(
        id="run-001",
        runNo=2,
        title="第2次课件生成",
        titleSource="pending",
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(
            update_many=AsyncMock(return_value=1),
            find_unique=AsyncMock(return_value=run),
        ),
    )
    monkeypatch.setattr(
        "services.title_service.service.update_session_run",
        AsyncMock(return_value=run),
    )
    spawned_labels: list[str] = []

    def _drop_task(coro, *, label: str) -> None:
        spawned_labels.append(label)
        if hasattr(coro, "close"):
            coro.close()

    monkeypatch.setattr(title_service, "spawn_background_task", _drop_task)

    result = await title_service.request_run_title_generation(
        db=db,
        run_id="run-001",
        tool_type="studio_card:courseware_ppt",
        snapshot={"topic": "牛顿第二定律"},
    )

    assert result is True
    title_service_module.update_session_run.assert_not_awaited()
    assert spawned_labels == ["run-title:run-001"]


def test_extract_run_context_prefers_topic_fields_over_config_noise():
    snapshot = {
        "topic": "牛顿第二定律",
        "pages": 12,
        "generation_mode": "scratch",
        "style_preset": "geo-bold",
        "visual_policy": "auto",
        "outline": {"title": "受力分析与公式应用"},
    }

    assert extract_run_context(snapshot) == "牛顿第二定律；受力分析与公式应用"


def test_normalize_effective_title_enriches_short_session_title():
    assert (
        normalize_effective_title(
            raw_title="教学大纲",
            basis_value="教学大纲",
            scene="session",
            max_length=18,
        )
        == "教学大纲备课"
    )


def test_build_session_title_payload_only_uses_first_message_context():
    payload = build_session_title_payload("生成一份教学大纲")

    assert payload["key_facts"]["first_message_seed"] == "教学大纲"
    assert "project_name_seed" not in payload["key_facts"]


def test_extract_run_key_facts_prefers_run_creation_prompt_fields():
    facts = extract_run_key_facts(
        {
            "config": {
                "topic": "图形系统功能结构与分类",
                "prompt": "生成一份图形系统功能结构与分类的课件",
                "generation_mode": "scratch",
            },
            "topic": "课件生成",
            "preview": {"title": "预览态标题"},
        }
    )

    assert facts["config_topic"] == "图形系统功能结构与分类"
    assert facts["config_prompt"] == "图形系统功能结构与分类的课件"
    assert facts["topic"] == "课件生成"


def test_build_run_pending_title_prefers_explicit_title_seed():
    title = build_run_pending_title(
        tool_type="studio_card:word_document",
        snapshot={
            "title": "计算机网络：物理层教案",
            "topic": "网络分层",
        },
        run_no=25,
    )

    assert title == "计算机网络"


@pytest.mark.anyio
async def test_generate_structured_title_uses_forced_tool_call_with_title_budget(
    monkeypatch,
):
    captured: dict[str, object] = {}

    async def _fake_completion(**kwargs):
        captured.update(kwargs)

        class _Function:
            arguments = (
                '{"title":"牛顿第二定律课件","basis_key":"topic","scene":"run"}'
            )

        class _ToolCall:
            function = _Function()

        class _Message:
            tool_calls = [_ToolCall()]

        class _Choice:
            message = _Message()

        class _Response:
            choices = [_Choice()]

        return _Response()

    monkeypatch.setattr(
        "services.title_service.structured_runtime.acompletion",
        _fake_completion,
    )
    monkeypatch.setattr(
        "services.title_service.structured_runtime.resolve_requested_model",
        lambda **_: (SimpleNamespace(reason="lightweight_task"), "minimax-m2.7", "title_polish"),
    )

    result = await generate_structured_title(
        scene="run",
        payload={"scene": "run", "key_facts": {"topic": "牛顿第二定律"}},
        entity_id="run-001",
    )

    assert captured["tool_choice"] == {
        "type": "function",
        "function": {"name": "set_title"},
    }
    assert captured["tools"][0]["function"]["name"] == "set_title"
    assert captured["max_tokens"] == TITLE_RESPONSE_MAX_TOKENS
    assert captured["max_retries"] == 0
    assert "extra_body" not in captured
    assert result.title == "牛顿第二定律课件"


@pytest.mark.anyio
async def test_generate_structured_title_disables_dashscope_thinking_for_tool_calls(
    monkeypatch,
):
    captured: dict[str, object] = {}

    async def _fake_completion(**kwargs):
        captured.update(kwargs)

        class _Function:
            arguments = (
                '{"title":"教学大纲备课","basis_key":"first_message_seed","scene":"session"}'
            )

        class _ToolCall:
            function = _Function()

        class _Message:
            tool_calls = [_ToolCall()]

        class _Choice:
            message = _Message()

        class _Response:
            choices = [_Choice()]

        return _Response()

    monkeypatch.setattr(
        "services.title_service.structured_runtime.acompletion",
        _fake_completion,
    )
    monkeypatch.setattr(
        "services.title_service.structured_runtime.resolve_requested_model",
        lambda **_: (
            SimpleNamespace(reason="lightweight_task"),
            "qwen3.5-flash-2026-02-23",
            "title_polish",
        ),
    )

    result = await generate_structured_title(
        scene="session",
        payload={"scene": "session", "key_facts": {"first_message_seed": "教学大纲"}},
        entity_id="session-001",
    )

    assert captured["model"] == "dashscope/qwen3.5-flash-2026-02-23"
    assert captured["extra_body"] == {
        "result_format": "message",
        "enable_thinking": False,
    }
    assert result.title == "教学大纲备课"


@pytest.mark.anyio
async def test_generate_structured_title_parses_minimax_raw_tool_call_content(
    monkeypatch,
):
    async def _fake_completion(**kwargs):
        class _Message:
            tool_calls = []
            content = (
                "<think>选择首条需求中的教学大纲作为依据。</think>\n"
                "<tool_calls>\n"
                '{"name":"set_title","arguments":'
                '{"title":"教学大纲备课","basis_key":"first_message_seed","scene":"session"}}\n'
                "</tool_calls>"
            )

        class _Choice:
            message = _Message()

        class _Response:
            choices = [_Choice()]

        return _Response()

    monkeypatch.setattr(
        "services.title_service.structured_runtime.acompletion",
        _fake_completion,
    )
    monkeypatch.setattr(
        "services.title_service.structured_runtime.resolve_requested_model",
        lambda **_: (
            SimpleNamespace(reason="lightweight_task"),
            "minimax-m2.7",
            "title_polish",
        ),
    )

    result = await generate_structured_title(
        scene="session",
        payload={"scene": "session", "key_facts": {"first_message_seed": "教学大纲"}},
        entity_id="session-001",
    )

    assert result.title == "教学大纲备课"
    assert result.basis_key == "first_message_seed"


@pytest.mark.anyio
async def test_generate_structured_title_does_not_retry_format_errors(monkeypatch):
    calls = 0

    async def _fake_completion(**kwargs):
        nonlocal calls
        calls += 1

        class _Message:
            tool_calls = []
            content = "我会生成一个标题"

        class _Choice:
            message = _Message()

        class _Response:
            choices = [_Choice()]

        return _Response()

    monkeypatch.setattr(
        "services.title_service.structured_runtime.acompletion",
        _fake_completion,
    )
    monkeypatch.setattr(
        "services.title_service.structured_runtime.resolve_requested_model",
        lambda **_: (
            SimpleNamespace(reason="lightweight_task"),
            "minimax-m2.7",
            "title_polish",
        ),
    )

    with pytest.raises(ValueError, match="structured_title_missing_tool_arguments"):
        await generate_structured_title(
            scene="session",
            payload={
                "scene": "session",
                "key_facts": {"first_message_seed": "教学大纲"},
            },
            entity_id="session-001",
        )

    assert calls == 1


@pytest.mark.anyio
async def test_generate_run_title_accepts_structured_title_and_syncs(monkeypatch):
    pending_run = SimpleNamespace(
        id="run-001",
        artifactId="artifact-001",
        runNo=3,
        title=build_pending_run_title(3, "studio_card:courseware_ppt"),
        titleSource="pending",
    )
    updated_run = SimpleNamespace(
        id="run-001",
        artifactId="artifact-001",
        runNo=3,
        title="牛顿第二定律课件",
        titleSource="auto",
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=pending_run)),
    )

    monkeypatch.setattr(
        "services.title_service.service.update_session_run",
        AsyncMock(return_value=updated_run),
    )
    monkeypatch.setattr(
        "services.title_service.service.sync_run_title_to_artifact_metadata",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        AsyncMock(
            return_value=StructuredTitleResult(
                title="牛顿第二定律课件",
                basis_key="topic",
                scene="run",
                model="minimax/MiniMax-M2.7",
                latency_ms=12.3,
            )
        ),
    )

    result = await title_service.generate_run_title(
        db=db,
        run_id="run-001",
        tool_type="studio_card:courseware_ppt",
        snapshot={
            "topic": "牛顿第二定律",
            "generation_mode": "scratch",
            "style_preset": "geo-bold",
        },
    )

    assert result["run_title"] == "牛顿第二定律课件"
    assert result["run_title_source"] == "auto"
    title_service_module.update_session_run.assert_awaited_once_with(
        db=db,
        run_id="run-001",
        title="牛顿第二定律课件",
        title_source="auto",
    )


@pytest.mark.anyio
async def test_generate_run_title_keeps_default_title_when_structured_payload_invalid(
    monkeypatch,
):
    pending_run = SimpleNamespace(
        id="run-001",
        artifactId=None,
        runNo=3,
        title=build_pending_run_title(3, "studio_card:courseware_ppt"),
        titleSource="pending",
    )
    updated_run = SimpleNamespace(
        id="run-001",
        artifactId=None,
        runNo=3,
        title=build_pending_run_title(3, "studio_card:courseware_ppt"),
        titleSource="fallback",
    )
    db = SimpleNamespace(
        sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=pending_run)),
    )

    monkeypatch.setattr(
        "services.title_service.service.update_session_run",
        AsyncMock(return_value=updated_run),
    )
    monkeypatch.setattr(
        "services.title_service.service.sync_run_title_to_artifact_metadata",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        AsyncMock(
            return_value=StructuredTitleResult(
                title="课件生成",
                basis_key="missing",
                scene="run",
                model="minimax/MiniMax-M2.7",
                latency_ms=12.3,
            )
        ),
    )

    result = await title_service.generate_run_title(
        db=db,
        run_id="run-001",
        tool_type="studio_card:courseware_ppt",
        snapshot={"topic": "牛顿第二定律"},
    )

    expected_title = build_pending_run_title(3, "studio_card:courseware_ppt")
    assert result["run_title"] == expected_title
    assert result["run_title_source"] == "fallback"
    title_service_module.update_session_run.assert_awaited_once_with(
        db=db,
        run_id="run-001",
        title=expected_title,
        title_source="fallback",
    )


@pytest.mark.anyio
async def test_generate_session_title_accepts_structured_title(monkeypatch):
    session = SimpleNamespace(
        id="session-001",
        displayTitle=None,
        displayTitleSource="default",
    )
    updated_session = SimpleNamespace(
        id="session-001",
        displayTitle="计算机图形学教学大纲",
        displayTitleSource="first_message",
        displayTitleUpdatedAt=None,
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(return_value=session),
            update=AsyncMock(return_value=updated_session),
        )
    )

    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        AsyncMock(
            return_value=StructuredTitleResult(
                title="计算机图形学教学大纲",
                basis_key="first_message_seed",
                scene="session",
                model="minimax/MiniMax-M2.7",
                latency_ms=8.1,
            )
        ),
    )

    result = await title_service.generate_session_title(
        db=db,
        session_id="session-001",
        first_message="生成一份教学大纲",
        project_name="计算机图形学教学",
    )

    assert result["display_title"] == "计算机图形学教学大纲"
    assert result["display_title_source"] == "first_message"


@pytest.mark.anyio
async def test_generate_session_title_retries_background_failures(monkeypatch):
    session = SimpleNamespace(
        id="session-001",
        displayTitle=None,
        displayTitleSource="default",
    )
    updated_session = SimpleNamespace(
        id="session-001",
        displayTitle="计算机图形学教学大纲",
        displayTitleSource="first_message",
        displayTitleUpdatedAt=None,
    )
    db = SimpleNamespace(
        generationsession=SimpleNamespace(
            find_unique=AsyncMock(return_value=session),
            update=AsyncMock(return_value=updated_session),
        )
    )
    structured_title = AsyncMock(
        side_effect=[
            ValueError("temporary_format_error"),
            StructuredTitleResult(
                title="计算机图形学教学大纲",
                basis_key="first_message_seed",
                scene="session",
                model="minimax/MiniMax-M2.7",
                latency_ms=8.1,
            ),
        ]
    )
    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        structured_title,
    )

    result = await title_service.generate_session_title(
        db=db,
        session_id="session-001",
        first_message="生成一份教学大纲",
        project_name="计算机图形学教学",
    )

    assert structured_title.await_count == 2
    assert result["display_title"] == "计算机图形学教学大纲"
    assert result["display_title_source"] == "first_message"


@pytest.mark.anyio
async def test_generate_project_title_keeps_default_name_on_invalid_structured_title(
    monkeypatch,
):
    project = SimpleNamespace(
        id="project-001",
        name=build_default_project_title("project-001"),
        nameSource="default",
    )
    updated_project = SimpleNamespace(
        id="project-001",
        name=build_default_project_title("project-001"),
        nameSource="fallback",
        nameUpdatedAt=None,
    )
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(return_value=project),
            update=AsyncMock(return_value=updated_project),
        )
    )

    structured_title = AsyncMock(
        return_value=StructuredTitleResult(
            title="知识库",
            basis_key="unknown_key",
            scene="project",
            model="minimax/MiniMax-M2.7",
            latency_ms=9.8,
        )
    )
    monkeypatch.setattr(
        "services.title_service.service.generate_structured_title",
        structured_title,
    )

    result = await title_service.generate_project_title(
        db=db,
        project_id="project-001",
        description="整理高中生物光合作用备课资料",
    )

    assert result["name"] == build_default_project_title("project-001")
    assert result["name_source"] == "fallback"
    assert (
        structured_title.await_count
        == title_service_module.TITLE_GENERATION_MAX_ATTEMPTS
    )


def test_build_default_session_title_is_used_for_session_failure():
    assert build_default_session_title("session-001").startswith("会话-")
