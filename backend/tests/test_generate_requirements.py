from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from routers.generate import _build_user_requirements


@pytest.mark.asyncio
async def test_build_user_requirements_includes_project_and_recent_user_messages():
    project = SimpleNamespace(name="项目名", description="基础描述")
    messages = [
        SimpleNamespace(role="assistant", content="你好，我来帮你"),
        SimpleNamespace(role="user", content="课件面向高一学生"),
        SimpleNamespace(role="user", content="教学中希望案例更多"),
    ]

    with (
        patch(
            "routers.generate.db_service.get_project",
            new=AsyncMock(return_value=project),
        ),
        patch(
            "routers.generate.db_service.get_conversation_messages",
            new=AsyncMock(return_value=messages),
        ),
    ):
        requirement = await _build_user_requirements("proj_1")

    assert "基础描述" in requirement
    assert "课件面向高一学生" in requirement
    assert "教学中希望案例更多" in requirement
    assert "你好，我来帮你" not in requirement


@pytest.mark.asyncio
async def test_build_user_requirements_filters_out_smalltalk():
    project = SimpleNamespace(name="项目名", description="高一化学")
    messages = [
        SimpleNamespace(role="user", content="今天天气不错"),
        SimpleNamespace(role="user", content="帮我做一份关于氧化还原反应的课件"),
        SimpleNamespace(role="user", content="哈哈你真厉害"),
    ]

    with (
        patch(
            "routers.generate.db_service.get_project",
            new=AsyncMock(return_value=project),
        ),
        patch(
            "routers.generate.db_service.get_conversation_messages",
            new=AsyncMock(return_value=messages),
        ),
    ):
        requirement = await _build_user_requirements("proj_1")

    assert "高一化学" in requirement
    assert "氧化还原反应" in requirement
    assert "天气不错" not in requirement
    assert "哈哈" not in requirement


@pytest.mark.asyncio
async def test_build_user_requirements_falls_back_to_project_name():
    project = SimpleNamespace(name="项目名", description=None)

    with (
        patch(
            "routers.generate.db_service.get_project",
            new=AsyncMock(return_value=project),
        ),
        patch(
            "routers.generate.db_service.get_conversation_messages",
            new=AsyncMock(return_value=[]),
        ),
    ):
        requirement = await _build_user_requirements("proj_2")

    assert requirement == "项目名"


@pytest.mark.asyncio
async def test_build_user_requirements_uses_latest_requirement_segment_only():
    project = SimpleNamespace(name="项目名", description="高中生物")
    messages = [
        SimpleNamespace(role="user", content="帮我做细胞分裂课件"),
        SimpleNamespace(role="user", content="重点讲有丝分裂"),
        SimpleNamespace(role="user", content="今天周末去哪玩"),
        SimpleNamespace(role="user", content="最近电影推荐一下"),
        SimpleNamespace(role="user", content="我想改成遗传定律课件"),
        SimpleNamespace(role="user", content="加入孟德尔实验案例"),
    ]

    with (
        patch(
            "routers.generate.db_service.get_project",
            new=AsyncMock(return_value=project),
        ),
        patch(
            "routers.generate.db_service.get_conversation_messages",
            new=AsyncMock(return_value=messages),
        ),
    ):
        requirement = await _build_user_requirements("proj_3")

    assert "高中生物" in requirement
    assert "遗传定律课件" in requirement
    assert "孟德尔实验案例" in requirement
    assert "细胞分裂课件" not in requirement
    assert "有丝分裂" not in requirement
