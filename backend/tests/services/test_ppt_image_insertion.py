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
            new=AsyncMock(return_value=[]),
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
    assert find_many_mock.await_count == 2


@pytest.mark.asyncio
async def test_inject_rag_images_into_courseware_content_uses_project_ready_images_in_strict_mode():
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
            new=AsyncMock(
                return_value=[
                    {
                        "id": "u-image-2",
                        "filename": "project-ready.png",
                        "filepath": "/app/uploads/project-ready.png",
                    }
                ]
            ),
        ),
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

    assert "![w:520](</app/uploads/project-ready.png>)" in courseware.markdown_content
    assert "配图来源：project-ready.png" in courseware.markdown_content


@pytest.mark.asyncio
async def test_inject_rag_images_scans_next_slide_when_current_is_skipped():
    db_service = SimpleNamespace(db=SimpleNamespace(upload=SimpleNamespace()))
    courseware = SimpleNamespace(
        markdown_content=(
            "# Cover\n\n- intro\n\n---\n\n# Definition\n\n- 概念说明\n\n---\n\n# Process\n\n- 步骤讲解\n\n---\n\n# End\n\n- 总结"
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
                            "filename": "flow.png",
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
                        "filename": "flow.png",
                        "filepath": "/app/uploads/flow.png",
                    }
                ]
            ),
        ),
    ):
        await inject_rag_images_into_courseware_content(
            db_service=db_service,
            project_id="p-001",
            query="流程课件",
            session_id="s-001",
            rag_source_ids=["u-image-1"],
            courseware_content=courseware,
            max_images=1,
        )

    slides = [part.strip() for part in courseware.markdown_content.split("\n\n---\n\n")]
    assert len(slides) == 4
    assert "![w:520](</app/uploads/flow.png>)" not in slides[1]
    assert "![w:520](</app/uploads/flow.png>)" in slides[2]


@pytest.mark.asyncio
async def test_inject_rag_images_for_selected_sources_appends_image_slide_when_needed():
    db_service = SimpleNamespace(db=SimpleNamespace(upload=SimpleNamespace()))
    courseware = SimpleNamespace(
        markdown_content=(
            "# Cover\n\n- intro\n\n---\n\n# Summary\n\n- 结论回顾\n\n---\n\n# End\n\n- 收尾"
        )
    )
    row = {
        "id": "u-image-9",
        "filename": "selected-only.png",
        "filepath": "/app/uploads/selected-only.png",
    }

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
            new=AsyncMock(side_effect=[[row], [row]]),
        ),
    ):
        await inject_rag_images_into_courseware_content(
            db_service=db_service,
            project_id="p-001",
            query="总结课件",
            session_id="s-001",
            rag_source_ids=["u-image-9"],
            courseware_content=courseware,
            max_images=1,
        )

    slides = [part.strip() for part in courseware.markdown_content.split("\n\n---\n\n")]
    assert len(slides) == 4
    assert "![w:900](</app/uploads/selected-only.png>)" in slides[-1]
    assert "配图来源：selected-only.png" in slides[-1]
