from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from schemas.generation import TaskStatus
from services.task_executor.generation import _validate_required_output_urls
from services.task_executor.generation_runtime import (
    GenerationExecutionContext,
    _build_project_space_download_url,
    persist_generation_artifacts,
    persist_preview_payload,
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
        retrieval_mode="strict_sources",
        policy_version="prompt-policy-v2026-03-28",
        baseline_id="prompt-baseline-v1",
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
    create_calls = db_service.create_artifact.await_args_list
    assert create_calls[0].kwargs["metadata"]["retrieval_mode"] == "strict_sources"
    assert (
        create_calls[0].kwargs["metadata"]["policy_version"]
        == "prompt-policy-v2026-03-28"
    )
    assert create_calls[0].kwargs["metadata"]["baseline_id"] == "prompt-baseline-v1"


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
        retrieval_mode="strict_sources",
        policy_version="prompt-policy-v2026-03-28",
        baseline_id="prompt-baseline-v1",
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
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
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
    assert "render_ppt_ms" in render_timings
    assert "render_word_ms" in render_timings
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
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_pptx.await_count == 1
    assert output_urls == {}
    assert artifact_paths == {"pptx": "/tmp/task-2.pptx"}
    assert "render_ppt_ms" in render_timings
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
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_docx.await_count == 1
    assert output_urls == {"docx": "/tmp/task-3.docx"}
    assert artifact_paths == {"docx": "/tmp/task-3.docx"}
    assert "render_word_ms" in render_timings
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-3", TaskStatus.PROCESSING, 90
    )


@pytest.mark.asyncio
async def test_persist_preview_payload_merges_existing_input_data():
    find_unique = AsyncMock(
        return_value=SimpleNamespace(
            inputData='{"template_config":{"style":"gaia"},"foo":"bar"}'
        )
    )
    update = AsyncMock()
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationtask=SimpleNamespace(
                find_unique=find_unique,
                update=update,
            )
        )
    )

    await persist_preview_payload(
        db_service,
        task_id="task-100",
        preview_payload={
            "title": "T",
            "markdown_content": "# Slide",
            "lesson_plan_markdown": "plan",
        },
    )

    find_unique.assert_awaited_once_with(
        where={"id": "task-100"},
        select={"inputData": True},
    )
    update.assert_awaited_once()
    payload = update.await_args.kwargs["data"]["inputData"]
    assert '"template_config"' in payload
    assert '"preview_content"' in payload


def test_validate_required_output_urls_raises_for_missing_both_output():
    with pytest.raises(ValueError, match="pptx, docx"):
        _validate_required_output_urls(task_type="both", output_urls={})


def test_validate_required_output_urls_allows_ppt_only_success():
    _validate_required_output_urls(
        task_type="pptx",
        output_urls={"pptx": "/api/v1/projects/p-1/artifacts/a-1/download"},
    )
