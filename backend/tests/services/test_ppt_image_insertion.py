from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from services.task_executor.ppt_image_insertion import (
    _extract_rag_image_upload_ids,
    inject_rag_images_into_courseware_content,
)


def test_extract_rag_image_upload_ids_filters_by_source_type_and_filename():
    rag_context = [
        {"metadata": {"upload_id": "u-image-1", "source_type": "image"}},
        {"metadata": {"upload_id": "u-doc-1", "source_type": "word"}},
        {"metadata": {"upload_id": "u-image-2", "filename": "demo.png"}},
        {"metadata": {"upload_id": "u-image-1", "source_type": "image"}},
    ]

    assert _extract_rag_image_upload_ids(rag_context) == ["u-image-1", "u-image-2"]


@pytest.mark.asyncio
async def test_inject_rag_images_into_courseware_content_appends_image_blocks():
    db_service = SimpleNamespace(db=SimpleNamespace(upload=SimpleNamespace()))
    courseware = SimpleNamespace(
        markdown_content=(
            "# 封面\n\n- 引入\n\n---\n\n# 核心概念\n\n- 要点一\n\n---\n\n# 总结\n\n- 回顾"
        )
    )

    with (
        patch(
            "services.ai.ai_service._retrieve_rag_context",
            new=AsyncMock(
                return_value=[
                    {
                        "metadata": {
                            "upload_id": "u-image-1",
                            "source_type": "image",
                            "filename": "network-topology.png",
                        }
                    }
                ]
            ),
        ),
        patch(
            "services.task_executor.ppt_image_insertion.find_many_with_select_fallback",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "u-image-1",
                        "filename": "network-topology.png",
                        "filepath": "/app/uploads/network-topology.png",
                    }
                ]
            ),
        ),
    ):
        await inject_rag_images_into_courseware_content(
            db_service=db_service,
            project_id="p-001",
            query="网络拓扑课件",
            session_id="s-001",
            rag_source_ids=["u-image-1"],
            courseware_content=courseware,
            max_images=1,
        )

    assert (
        "![w:520](</app/uploads/network-topology.png>)" in courseware.markdown_content
    )
    assert "配图来源：network-topology.png" in courseware.markdown_content


@pytest.mark.asyncio
async def test_inject_rag_images_into_courseware_content_skips_when_no_image_hit():
    db_service = SimpleNamespace(db=SimpleNamespace(upload=SimpleNamespace()))
    original_markdown = "# 标题\n\n- 内容"
    courseware = SimpleNamespace(markdown_content=original_markdown)

    with (
        patch(
            "services.ai.ai_service._retrieve_rag_context",
            new=AsyncMock(
                return_value=[
                    {
                        "metadata": {
                            "upload_id": "u-doc-1",
                            "source_type": "word",
                            "filename": "chapter.docx",
                        }
                    }
                ]
            ),
        ),
        patch(
            "services.task_executor.ppt_image_insertion.find_many_with_select_fallback",
            new=AsyncMock(),
        ) as find_many_mock,
    ):
        await inject_rag_images_into_courseware_content(
            db_service=db_service,
            project_id="p-001",
            query="网络课件",
            session_id=None,
            rag_source_ids=["u-doc-1"],
            courseware_content=courseware,
            max_images=1,
        )

    assert courseware.markdown_content == original_markdown
    find_many_mock.assert_not_awaited()
