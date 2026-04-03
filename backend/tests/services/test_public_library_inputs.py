from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.generation_session_service.public_library_inputs import (
    apply_public_library_inputs,
)
from utils.exceptions import ValidationException


@pytest.mark.asyncio
async def test_apply_public_library_inputs_creates_project_reference_with_pinned_default():
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                return_value=SimpleNamespace(
                    id="proj-public-math",
                    userId="u-owner",
                    visibility="shared",
                    isReferenceable=True,
                    currentVersionId="ver-current-1",
                )
            )
        ),
        projectreference=SimpleNamespace(
            find_many=AsyncMock(return_value=[]),
            create=AsyncMock(),
            update=AsyncMock(),
        ),
    )

    options = {
        "rag_source_ids": ["file-1"],
        "public_library_inputs": [
            {
                "project_id": "proj-public-math",
                "relation_type": "base",
                "mode": "pinned",
            }
        ],
    }
    resolved = await apply_public_library_inputs(
        db=db,
        project_id="proj-current",
        user_id="u-owner",
        options=options,
    )

    assert resolved == options
    db.projectreference.create.assert_awaited_once()
    created = db.projectreference.create.await_args.kwargs["data"]
    assert created["projectId"] == "proj-current"
    assert created["targetProjectId"] == "proj-public-math"
    assert created["relationType"] == "base"
    assert created["mode"] == "pinned"
    assert created["pinnedVersionId"] == "ver-current-1"


@pytest.mark.asyncio
async def test_apply_public_library_inputs_rejects_multiple_base_targets():
    db = SimpleNamespace(
        project=SimpleNamespace(
            find_unique=AsyncMock(
                side_effect=[
                    SimpleNamespace(
                        id="proj-public-a",
                        userId="u-owner",
                        visibility="shared",
                        isReferenceable=True,
                        currentVersionId="ver-a",
                    ),
                    SimpleNamespace(
                        id="proj-public-b",
                        userId="u-owner",
                        visibility="shared",
                        isReferenceable=True,
                        currentVersionId="ver-b",
                    ),
                ]
            )
        ),
        projectreference=SimpleNamespace(
            find_many=AsyncMock(return_value=[]),
            create=AsyncMock(),
            update=AsyncMock(),
        ),
    )

    with pytest.raises(ValidationException):
        await apply_public_library_inputs(
            db=db,
            project_id="proj-current",
            user_id="u-owner",
            options={
                "public_library_inputs": [
                    {
                        "project_id": "proj-public-a",
                        "relation_type": "base",
                        "mode": "follow",
                    },
                    {
                        "project_id": "proj-public-b",
                        "relation_type": "base",
                        "mode": "follow",
                    },
                ]
            },
        )
