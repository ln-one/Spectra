from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.project_space import (
    CandidateChangeReviewAction,
    CandidateChangeStatus,
)
from services.project_space_service import ProjectSpaceService
from utils.exceptions import ConflictException


def _fake_change(
    status: CandidateChangeStatus | str = CandidateChangeStatus.PENDING,
    base_version_id: str | None = "v-001",
):
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
        get_candidate_change=AsyncMock(
            return_value=_fake_change(status=CandidateChangeStatus.ACCEPTED)
        ),
    )

    with pytest.raises(ConflictException):
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action=CandidateChangeReviewAction.ACCEPT,
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
            action=CandidateChangeReviewAction.ACCEPT,
            review_comment="conflict",
            reviewer_user_id="u-001",
        )


@pytest.mark.asyncio
async def test_review_candidate_change_reject_persists_review_comment():
    service = ProjectSpaceService()
    updated_change = SimpleNamespace(id="c-001", status=CandidateChangeStatus.REJECTED)
    update_status = AsyncMock(return_value=updated_change)
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        update_candidate_change_status=update_status,
    )

    result = await service.review_candidate_change(
        project_id="p-001",
        change_id="c-001",
        action=CandidateChangeReviewAction.REJECT,
        review_comment="not acceptable",
        reviewer_user_id="u-001",
    )

    assert result is updated_change
    update_status.assert_awaited_once_with(
        "c-001",
        CandidateChangeStatus.REJECTED,
        "not acceptable",
    )


@pytest.mark.asyncio
async def test_review_candidate_change_accept_persists_accepted_version():
    service = ProjectSpaceService()
    updated_change = SimpleNamespace(id="c-001", status=CandidateChangeStatus.ACCEPTED)
    update_status = AsyncMock(return_value=updated_change)
    create_version = AsyncMock(return_value=SimpleNamespace(id="v-002"))
    update_current_version = AsyncMock(return_value=None)
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
        ),
        create_project_version=create_version,
        update_project_current_version=update_current_version,
        update_candidate_change_status=update_status,
    )

    result = await service.review_candidate_change(
        project_id="p-001",
        change_id="c-001",
        action=CandidateChangeReviewAction.ACCEPT,
        review_comment="looks good",
        reviewer_user_id="u-reviewer-001",
    )

    assert result is updated_change
    create_version.assert_awaited_once()
    update_current_version.assert_awaited_once_with("p-001", "v-002")
    update_status.assert_awaited_once_with(
        "c-001",
        CandidateChangeStatus.ACCEPTED,
        "looks good",
        payload={
            "review": {
                "action": CandidateChangeReviewAction.ACCEPT,
                "accepted_version_id": "v-002",
                "reviewer_user_id": "u-reviewer-001",
                "review_comment": "looks good",
            }
        },
    )


@pytest.mark.asyncio
async def test_review_candidate_change_invalid_action_rejected_before_db_write():
    service = ProjectSpaceService()
    update_status = AsyncMock()
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        update_candidate_change_status=update_status,
    )

    with pytest.raises(Exception) as exc_info:
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action="reopen",
            review_comment="invalid",
            reviewer_user_id="u-001",
        )

    assert "Invalid action" in str(exc_info.value)
    update_status.assert_not_awaited()
