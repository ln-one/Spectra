import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.preview_helpers.content import get_or_generate_content


@pytest.mark.asyncio
async def test_get_or_generate_content_uses_session_messages_and_selected_sources(
    monkeypatch,
):
    task = SimpleNamespace(
        id="task-001",
        status="completed",
        sessionId="session-001",
        templateConfig=json.dumps({"rag_source_ids": ["file-1", "file-2"]}),
    )
    project = SimpleNamespace(id="project-001", name="牛顿第二定律")

    monkeypatch.setattr(
        "services.preview_helpers.content.load_preview_content",
        AsyncMock(return_value=None),
    )
    save_mock = AsyncMock()
    monkeypatch.setattr(
        "services.preview_helpers.content.save_preview_content", save_mock
    )

    recent_mock = AsyncMock(
        return_value=[
            SimpleNamespace(role="user", content="请强调实验导入"),
            SimpleNamespace(role="assistant", content="好的"),
        ]
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service.get_recent_conversation_messages",
        recent_mock,
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service.db",
        SimpleNamespace(
            outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None))
        ),
    )

    generate_mock = AsyncMock(
        return_value=SimpleNamespace(
            title="牛顿第二定律",
            markdown_content="# Slide",
            lesson_plan_markdown="plan",
        )
    )
    monkeypatch.setattr(
        "services.ai.ai_service.generate_courseware_content", generate_mock
    )

    result = await get_or_generate_content(task, project)

    assert result["title"] == "牛顿第二定律"
    recent_mock.assert_awaited_once_with(
        "project-001",
        limit=5,
        session_id="session-001",
    )
    assert generate_mock.await_args.kwargs["session_id"] == "session-001"
    assert generate_mock.await_args.kwargs["rag_source_ids"] == ["file-1", "file-2"]
    assert "请强调实验导入" == generate_mock.await_args.kwargs["user_requirements"]
    save_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_or_generate_content_rehydrates_from_task_input_data(monkeypatch):
    task = SimpleNamespace(
        id="task-002",
        status="completed",
        sessionId="session-002",
        templateConfig=None,
        inputData=json.dumps(
            {
                "preview_content": {
                    "title": "缓存课件",
                    "markdown_content": "# Cached",
                    "lesson_plan_markdown": "cached plan",
                }
            }
        ),
    )
    project = SimpleNamespace(id="project-002", name="缓存项目")

    monkeypatch.setattr(
        "services.preview_helpers.content.load_preview_content",
        AsyncMock(return_value=None),
    )
    save_mock = AsyncMock()
    monkeypatch.setattr(
        "services.preview_helpers.content.save_preview_content",
        save_mock,
    )
    generate_mock = AsyncMock()
    monkeypatch.setattr(
        "services.ai.ai_service.generate_courseware_content",
        generate_mock,
    )

    result = await get_or_generate_content(task, project)

    assert result == {
        "title": "缓存课件",
        "markdown_content": "# Cached",
        "lesson_plan_markdown": "cached plan",
    }
    save_mock.assert_awaited_once()
    generate_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_or_generate_content_timeout_returns_fallback(monkeypatch):
    task = SimpleNamespace(
        id="task-003",
        status="completed",
        sessionId="session-003",
        templateConfig=None,
        inputData=None,
    )
    project = SimpleNamespace(id="project-003", name="超时项目")

    monkeypatch.setattr(
        "services.preview_helpers.content.load_preview_content",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service.get_recent_conversation_messages",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service.db",
        SimpleNamespace(
            outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None))
        ),
    )
    monkeypatch.setattr(
        "services.ai.ai_service.generate_courseware_content",
        AsyncMock(side_effect=asyncio.TimeoutError("simulated timeout")),
    )

    result = await get_or_generate_content(task, project)

    assert result == {
        "title": "超时项目",
        "markdown_content": "",
        "lesson_plan_markdown": "",
    }
