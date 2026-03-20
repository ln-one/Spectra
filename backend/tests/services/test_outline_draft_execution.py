from types import SimpleNamespace

import pytest

from services.generation_session_service.outline_draft.execution import (
    _generate_outline_doc,
)


class _FakeFindMany:
    async def __call__(self, **_kwargs):
        return [
            SimpleNamespace(role="user", content="请做成适合高一的牛顿第二定律课件"),
            SimpleNamespace(role="assistant", content="好的"),
            SimpleNamespace(role="user", content="希望更强调实验导入和习题"),
        ]


class _FakeFindProject:
    async def __call__(self, **_kwargs):
        return SimpleNamespace(
            id="p-001",
            name="牛顿第二定律",
            description="物理课",
        )


class _FakeAIService:
    def __init__(self):
        self.kwargs = None

    async def generate_outline(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            sections=[
                SimpleNamespace(
                    title="实验导入",
                    key_points=["受力分析", "控制变量"],
                    slide_count=2,
                )
            ],
            summary="summary",
        )


@pytest.mark.asyncio
async def test_generate_outline_doc_includes_session_chat_requirements():
    db = SimpleNamespace(
        project=SimpleNamespace(find_unique=_FakeFindProject()),
        conversation=SimpleNamespace(find_many=_FakeFindMany()),
    )
    ai_service = _FakeAIService()

    outline = await _generate_outline_doc(
        db=db,
        session_id="s-001",
        project_id="p-001",
        options={"pages": 12, "audience": "高一"},
        ai_service_obj=ai_service,
    )

    assert outline["nodes"][0]["title"] == "实验导入（1）"
    assert ai_service.kwargs["session_id"] == "s-001"
    assert ai_service.kwargs["rag_source_ids"] is None
    assert "请做成适合高一的牛顿第二定律课件" in ai_service.kwargs["user_requirements"]
    assert "希望更强调实验导入和习题" in ai_service.kwargs["user_requirements"]
    assert "目标页数：12" in ai_service.kwargs["user_requirements"]


@pytest.mark.asyncio
async def test_generate_outline_doc_passes_selected_sources():
    db = SimpleNamespace(
        project=SimpleNamespace(find_unique=_FakeFindProject()),
        conversation=SimpleNamespace(find_many=_FakeFindMany()),
    )
    ai_service = _FakeAIService()

    await _generate_outline_doc(
        db=db,
        session_id="s-001",
        project_id="p-001",
        options={"rag_source_ids": ["file-1", "file-2"]},
        ai_service_obj=ai_service,
    )

    assert ai_service.kwargs["rag_source_ids"] == ["file-1", "file-2"]
