from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from schemas.generation import TaskStatus
from services.task_executor.generation_runtime import (
    GenerationExecutionContext,
    _build_project_space_download_url,
    persist_generation_artifacts,
    render_generation_outputs,
)


def test_build_project_space_download_url():
    assert (
        _build_project_space_download_url(project_id="p-1", artifact_id="a-1")
        == "/api/v1/projects/p-1/artifacts/a-1/download"
    )


@pytest.mark.asyncio
async def test_persist_generation_artifacts_returns_download_urls():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        userId="u-1",
                        baseVersionId="v-1",
                        projectId="p-1",
                    )
                )
            )
        ),
        create_artifact=AsyncMock(
            side_effect=[
                SimpleNamespace(id="artifact-ppt"),
                SimpleNamespace(id="artifact-doc"),
            ]
        ),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="p-1",
        session_id="s-1",
    )

    output_urls = await persist_generation_artifacts(
        db_service=db_service,
        context=context,
        artifact_paths={
            "pptx": "/tmp/a.pptx",
            "docx": "/tmp/a.docx",
        },
    )

    assert output_urls == {
        "pptx": "/api/v1/projects/p-1/artifacts/artifact-ppt/download",
        "docx": "/api/v1/projects/p-1/artifacts/artifact-doc/download",
    }
    db_service.db.generationsession.find_unique.assert_awaited_once_with(
        where={"id": "s-1"},
        select={
            "userId": True,
            "baseVersionId": True,
            "projectId": True,
        },
    )


@pytest.mark.asyncio
async def test_persist_generation_artifacts_partial_failure_keeps_success_outputs():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        userId="u-1",
                        baseVersionId="v-1",
                        projectId="p-1",
                    )
                )
            )
        ),
        create_artifact=AsyncMock(
            side_effect=[
                RuntimeError("pptx persist failed"),
                SimpleNamespace(id="artifact-doc"),
            ]
        ),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="p-1",
        session_id="s-1",
    )

    output_urls = await persist_generation_artifacts(
        db_service=db_service,
        context=context,
        artifact_paths={
            "pptx": "/tmp/a.pptx",
            "docx": "/tmp/a.docx",
        },
    )

    assert output_urls == {
        "docx": "/api/v1/projects/p-1/artifacts/artifact-doc/download",
    }


@pytest.mark.asyncio
async def test_render_generation_outputs_parallel_for_both():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-1",
        project_id="p-1",
        task_type="both",
        template_config=None,
        session_id="s-1",
    )

    with (
        patch(
            "services.generation.generation_service.generate_pptx",
            new=AsyncMock(return_value="/tmp/task-1.pptx"),
        ) as mock_pptx,
        patch(
            "services.generation.generation_service.generate_docx",
            new=AsyncMock(return_value="/tmp/task-1.docx"),
        ) as mock_docx,
    ):
        output_urls, artifact_paths = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_pptx.await_count == 1
    assert mock_docx.await_count == 1
    assert output_urls == {}
    assert artifact_paths == {
        "pptx": "/tmp/task-1.pptx",
        "docx": "/tmp/task-1.docx",
    }
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-1", TaskStatus.PROCESSING, 90
    )


@pytest.mark.asyncio
async def test_render_generation_outputs_pptx_only_keeps_progress_contract():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-2",
        project_id="p-1",
        task_type="pptx",
        template_config=None,
        session_id="s-2",
    )

    with patch(
        "services.generation.generation_service.generate_pptx",
        new=AsyncMock(return_value="/tmp/task-2.pptx"),
    ) as mock_pptx:
        output_urls, artifact_paths = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_pptx.await_count == 1
    assert output_urls == {}
    assert artifact_paths == {"pptx": "/tmp/task-2.pptx"}
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-2", TaskStatus.PROCESSING, 60
    )


@pytest.mark.asyncio
async def test_render_generation_outputs_non_session_still_emits_direct_urls():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-3",
        project_id="p-1",
        task_type="docx",
        template_config=None,
        session_id=None,
    )

    with patch(
        "services.generation.generation_service.generate_docx",
        new=AsyncMock(return_value="/tmp/task-3.docx"),
    ) as mock_docx:
        output_urls, artifact_paths = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_docx.await_count == 1
    assert output_urls == {"docx": "/tmp/task-3.docx"}
    assert artifact_paths == {"docx": "/tmp/task-3.docx"}
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-3", TaskStatus.PROCESSING, 90
    )
