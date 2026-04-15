import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.preview_helpers.content import (
    get_or_generate_content,
    load_preview_material,
)


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
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            get_recent_conversation_messages=recent_mock,
            db=SimpleNamespace(
                outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None))
            ),
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
                    "_image_metadata": {
                        "retrieval_mode": "default_library",
                        "slides_metadata": [
                            {
                                "slide_index": 0,
                                "page_semantic_type": "priority",
                                "image_insertion_decision": "insert",
                            }
                        ],
                    },
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
        "_image_metadata": {
            "retrieval_mode": "default_library",
            "slides_metadata": [
                {
                    "slide_index": 0,
                    "page_semantic_type": "priority",
                    "image_insertion_decision": "insert",
                }
            ],
        },
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
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            get_recent_conversation_messages=AsyncMock(return_value=[]),
            db=SimpleNamespace(
                outlineversion=SimpleNamespace(find_first=AsyncMock(return_value=None))
            ),
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


@pytest.mark.asyncio
async def test_get_or_generate_content_failed_task_uses_outline_preview(monkeypatch):
    task = SimpleNamespace(
        id="task-004",
        status="failed",
        sessionId="session-004",
        templateConfig=None,
        inputData=None,
    )
    project = SimpleNamespace(id="project-004", name="失败回退项目")
    outline_doc = {
        "version": 1,
        "nodes": [
            {
                "order": 1,
                "title": "导入",
                "key_points": ["目标说明", "互动提问"],
            },
            {
                "order": 2,
                "title": "核心讲解",
                "key_points": ["知识地图", "关键例题", "易错点澄清"],
            },
        ],
    }

    monkeypatch.setattr(
        "services.preview_helpers.content.load_preview_content",
        AsyncMock(return_value=None),
    )
    save_mock = AsyncMock()
    monkeypatch.setattr(
        "services.preview_helpers.content.save_preview_content",
        save_mock,
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            get_recent_conversation_messages=AsyncMock(return_value=[]),
            db=SimpleNamespace(
                outlineversion=SimpleNamespace(
                    find_first=AsyncMock(
                        return_value=SimpleNamespace(
                            outlineData=json.dumps(outline_doc),
                            version=1,
                        )
                    )
                )
            ),
        ),
    )
    generate_mock = AsyncMock()
    monkeypatch.setattr(
        "services.ai.ai_service.generate_courseware_content",
        generate_mock,
    )

    result = await get_or_generate_content(task, project)

    assert result["title"] == "失败回退项目"
    assert "# 导入" in result["markdown_content"]
    assert "# 核心讲解" in result["markdown_content"]
    assert "教学过程" in result["lesson_plan_markdown"]
    save_mock.assert_awaited_once()
    generate_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_or_generate_content_ppt_task_does_not_trigger_ai_rebuild(monkeypatch):
    task = SimpleNamespace(
        id="task-005",
        status="completed",
        sessionId="session-005",
        templateConfig=None,
        inputData=None,
        outputType="ppt",
        toolType="studio_card:courseware_ppt",
    )
    project = SimpleNamespace(id="project-005", name="PPT Diego")
    outline_doc = {
        "version": 1,
        "nodes": [
            {
                "order": 1,
                "title": "封面",
                "key_points": ["主题", "副标题"],
            }
        ],
    }

    monkeypatch.setattr(
        "services.preview_helpers.content.load_preview_content",
        AsyncMock(return_value=None),
    )
    recent_mock = AsyncMock(return_value=[])
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            get_recent_conversation_messages=recent_mock,
            db=SimpleNamespace(
                outlineversion=SimpleNamespace(
                    find_first=AsyncMock(
                        return_value=SimpleNamespace(
                            outlineData=json.dumps(outline_doc),
                            version=1,
                        )
                    )
                )
            ),
        ),
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

    assert result["title"] == "PPT Diego"
    assert "# 封面" in result["markdown_content"]
    recent_mock.assert_not_awaited()
    generate_mock.assert_not_awaited()
    save_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_load_preview_material_reads_artifact_preview_content(
    monkeypatch,
):
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            db=SimpleNamespace(
                sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
                artifact=SimpleNamespace(
                    find_unique=AsyncMock(return_value=None),
                    find_first=AsyncMock(
                        return_value=SimpleNamespace(
                            id="artifact-001",
                            sessionId="session-001",
                            metadata=json.dumps(
                                {
                                    "preview_content": {
                                        "title": "测试课程",
                                        "markdown_content": "# Slide",
                                        "lesson_plan_markdown": "plan",
                                    }
                                }
                            ),
                        )
                    ),
                ),
            ),
        ),
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.build_slides",
        lambda _task_id, _md, _image_metadata=None, _render_markdown=None: [
            SimpleNamespace(model_dump=lambda: {"id": "slide-1", "title": "S1"})
        ],
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.build_lesson_plan",
        lambda _slides, _plan_md: SimpleNamespace(
            model_dump=lambda: {"summary": "ok", "steps": []}
        ),
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.save_preview_content",
        AsyncMock(),
    )

    material_context, slides, lesson_plan, content = await load_preview_material(
        session_id="session-001",
        project_id="project-001",
    )

    assert material_context is not None
    assert material_context["artifact_id"] == "artifact-001"
    assert material_context["render_job_id"] == "artifact-001"
    assert slides == [{"id": "slide-1", "title": "S1"}]
    assert lesson_plan == {"summary": "ok", "steps": []}
    assert content["title"] == "测试课程"


@pytest.mark.asyncio
async def test_load_preview_material_returns_explicitly_missing_without_artifact_preview_content(
    monkeypatch,
):
    monkeypatch.setattr(
        "services.preview_helpers.content.db_service",
        SimpleNamespace(
            db=SimpleNamespace(
                sessionrun=SimpleNamespace(find_unique=AsyncMock(return_value=None)),
                artifact=SimpleNamespace(
                    find_unique=AsyncMock(return_value=None),
                    find_first=AsyncMock(
                        return_value=SimpleNamespace(
                            id="artifact-002",
                            sessionId="session-002",
                            metadata="{}",
                        )
                    ),
                ),
            ),
        ),
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.build_slides",
        lambda _task_id, _md, _image_metadata=None, _render_markdown=None: [
            SimpleNamespace(model_dump=lambda: {"id": "slide-1", "title": "S1"})
        ],
    )
    monkeypatch.setattr(
        "services.preview_helpers.content.build_lesson_plan",
        lambda _slides, _plan_md: SimpleNamespace(
            model_dump=lambda: {"summary": "ok", "steps": []}
        ),
    )
    save_mock = AsyncMock()
    monkeypatch.setattr(
        "services.preview_helpers.content.save_preview_content",
        save_mock,
    )

    material_context, slides, lesson_plan, content = await load_preview_material(
        session_id="session-002",
        project_id="project-002",
    )

    assert material_context is not None
    assert material_context["artifact_id"] == "artifact-002"
    assert material_context["render_job_id"] == "artifact-002"
    assert slides == []
    assert lesson_plan is None
    assert content == {}
    assert "rendered_preview" not in content
    save_mock.assert_not_awaited()
