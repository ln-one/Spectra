from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service import ProjectSpaceService
from utils.exceptions import ConflictException


def _fake_change(status: str = "pending", base_version_id: str | None = "v-001"):
    return SimpleNamespace(
        id="c-001",
        projectId="p-001",
        baseVersionId=base_version_id,
        title="candidate change",
        summary="summary",
        payload="{}",
        status=status,
    )


@pytest.mark.asyncio
async def test_review_candidate_change_status_conflict_returns_409():
    service = ProjectSpaceService()
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="accepted")),
    )

    with pytest.raises(ConflictException):
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action="accept",
            review_comment="conflict",
            reviewer_user_id="u-001",
        )


@pytest.mark.asyncio
async def test_review_candidate_change_base_version_conflict_returns_409():
    service = ProjectSpaceService()
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="v-999")
        ),
    )

    with pytest.raises(ConflictException):
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action="accept",
            review_comment="conflict",
            reviewer_user_id="u-001",
        )


@pytest.mark.asyncio
async def test_review_candidate_change_reject_persists_review_comment():
    service = ProjectSpaceService()
    updated_change = SimpleNamespace(id="c-001", status="rejected")
    update_status = AsyncMock(return_value=updated_change)
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        update_candidate_change_status=update_status,
    )

    result = await service.review_candidate_change(
        project_id="p-001",
        change_id="c-001",
        action="reject",
        review_comment="not acceptable",
        reviewer_user_id="u-001",
    )

    assert result is updated_change
    update_status.assert_awaited_once_with("c-001", "rejected", "not acceptable")
