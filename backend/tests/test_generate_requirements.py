from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from routers.generate import _build_user_requirements


@pytest.mark.asyncio
async def test_build_user_requirements_includes_project_and_recent_user_messages():
    project = SimpleNamespace(name="项目名", description="基础描述")
    messages = [
        SimpleNamespace(role="assistant", content="你好，我来帮你"),
        SimpleNamespace(role="user", content="面向高一学生"),
        SimpleNamespace(role="user", content="希望案例更多"),
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
    assert "面向高一学生" in requirement
    assert "希望案例更多" in requirement
    assert "你好，我来帮你" not in requirement


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
