from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.task_executor.generation_runtime import (
    _build_project_space_download_url,
    persist_generation_artifacts,
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
