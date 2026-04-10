from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_executor import _build_user_requirements


@dataclass
class MockProject:
    name: str
    description: str | None


@dataclass
class MockMessage:
    role: str
    content: str


@pytest.mark.asyncio
async def test_build_user_requirements_includes_project_and_recent_user_messages():
    project = MockProject(name="项目名", description="基础描述")
    messages = [
        MockMessage(role="assistant", content="你好，我来帮你"),
        MockMessage(role="user", content="课件面向高一学生"),
        MockMessage(role="user", content="教学中希望案例更多"),
    ]
    db_service = AsyncMock()
    db_service.get_project.return_value = project
    db_service.get_recent_conversation_messages.return_value = messages
    requirement = await _build_user_requirements(db_service, "proj_1")

    assert "项目名称：项目名" in requirement
    assert "项目描述：基础描述" in requirement
    assert "课件面向高一学生" in requirement
    assert "教学中希望案例更多" in requirement
    assert "你好，我来帮你" not in requirement


@pytest.mark.asyncio
async def test_build_user_requirements_includes_latest_three_user_messages():
    project = MockProject(name="项目名", description="高一化学")
    messages = [
        MockMessage(role="user", content="今天天气不错"),
        MockMessage(role="user", content="帮我做一份关于氧化还原反应的课件"),
        MockMessage(role="user", content="哈哈你真厉害"),
        MockMessage(role="assistant", content="好的"),
        MockMessage(role="user", content="加入更多实验案例"),
    ]
    db_service = AsyncMock()
    db_service.get_project.return_value = project
    db_service.get_recent_conversation_messages.return_value = messages
    requirement = await _build_user_requirements(db_service, "proj_1")

    assert "高一化学" in requirement
    assert "氧化还原反应" in requirement
    assert "哈哈你真厉害" in requirement
    assert "加入更多实验案例" in requirement
    assert "今天天气不错" not in requirement


@pytest.mark.asyncio
async def test_build_user_requirements_falls_back_to_project_name():
    project = MockProject(name="项目名", description=None)
    db_service = AsyncMock()
    db_service.get_project.return_value = project
    db_service.get_recent_conversation_messages.return_value = []
    requirement = await _build_user_requirements(db_service, "proj_2")

    assert requirement == "项目名称：项目名"


@pytest.mark.asyncio
async def test_build_user_requirements_uses_latest_three_user_messages():
    project = MockProject(name="项目名", description="高中生物")
    messages = [
        MockMessage(role="user", content="帮我做细胞分裂课件"),
        MockMessage(role="user", content="重点讲有丝分裂"),
        MockMessage(role="user", content="今天周末去哪玩"),
        MockMessage(role="user", content="最近电影推荐一下"),
        MockMessage(role="user", content="我想改成遗传定律课件"),
        MockMessage(role="user", content="加入孟德尔实验案例"),
    ]
    db_service = AsyncMock()
    db_service.get_project.return_value = project
    db_service.get_recent_conversation_messages.return_value = messages
    requirement = await _build_user_requirements(db_service, "proj_3")

    assert "项目描述：高中生物" in requirement
    assert "遗传定律课件" in requirement
    assert "孟德尔实验案例" in requirement
    assert "细胞分裂课件" not in requirement
    assert "有丝分裂" not in requirement


@pytest.mark.asyncio
async def test_build_user_requirements_missing_project_returns_default():
    db_service = AsyncMock()
    db_service.get_project.return_value = None
    requirement = await _build_user_requirements(db_service, "proj_404")
    assert requirement == "生成课件"


@pytest.mark.asyncio
async def test_build_user_requirements_loads_selected_uploads_with_select():
    project = MockProject(name="项目名", description="基础描述")
    db_service = AsyncMock()
    db_service.get_project.return_value = project
    db_service.get_recent_conversation_messages.return_value = []
    db_service.db.upload.find_many = AsyncMock(
        return_value=[
            {"filename": "chapter-1.pdf", "status": "ready"},
            SimpleNamespace(filename="chapter-2.pdf", status="processing"),
        ]
    )

    requirement = await _build_user_requirements(
        db_service,
        "proj_1",
        rag_source_ids=["u-1", "u-2"],
    )

    assert "chapter-1.pdf（状态：ready）" in requirement
    assert "chapter-2.pdf（状态：processing）" in requirement
    db_service.db.upload.find_many.assert_awaited_once_with(
        where={"projectId": "proj_1", "id": {"in": ["u-1", "u-2"]}},
        select={"filename": True, "status": True},
    )
