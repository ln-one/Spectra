from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock

import pytest

from schemas.project_space import CandidateChangeReviewAction, CandidateChangeStatus
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
async def test_review_candidate_change_rejects_missing_base_version_anchor():
    service = ProjectSpaceService()
    create_version = AsyncMock()
    update_current_version = AsyncMock()
    update_status = AsyncMock()
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
        ),
        get_project_version=AsyncMock(return_value=None),
        get_project_references=AsyncMock(return_value=[]),
        get_candidate_changes=AsyncMock(return_value=[]),
        create_project_version=create_version,
        update_project_current_version=update_current_version,
        update_candidate_change_status=update_status,
    )

    with pytest.raises(
        ConflictException, match="Base version is missing or no longer belongs"
    ):
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action=CandidateChangeReviewAction.ACCEPT,
            review_comment="conflict",
            reviewer_user_id="u-001",
        )

    create_version.assert_not_awaited()
    update_current_version.assert_not_awaited()
    update_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_review_candidate_change_rejects_invalid_created_version_project():
    service = ProjectSpaceService()
    update_current_version = AsyncMock()
    update_status = AsyncMock()
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
        ),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="v-001", projectId="p-001")
        ),
        get_project_references=AsyncMock(return_value=[]),
        get_candidate_changes=AsyncMock(return_value=[]),
        create_project_version=AsyncMock(
            return_value=SimpleNamespace(id="v-002", projectId="p-other")
        ),
        update_project_current_version=update_current_version,
        update_candidate_change_status=update_status,
    )

    with pytest.raises(ConflictException, match="created an invalid project version"):
        await service.review_candidate_change(
            project_id="p-001",
            change_id="c-001",
            action=CandidateChangeReviewAction.ACCEPT,
            review_comment="conflict",
            reviewer_user_id="u-001",
        )

    update_current_version.assert_not_awaited()
    update_status.assert_not_awaited()


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
        reviewed_by="u-001",
        reviewed_at=ANY,
    )


@pytest.mark.asyncio
async def test_review_candidate_change_accept_persists_accepted_version():
    service = ProjectSpaceService()
    updated_change = SimpleNamespace(id="c-001", status=CandidateChangeStatus.ACCEPTED)
    update_status = AsyncMock(return_value=updated_change)
    create_version = AsyncMock(return_value=SimpleNamespace(id="v-002"))
    update_current_version = AsyncMock(return_value=None)
    sibling_change = SimpleNamespace(
        id="c-002", baseVersionId="v-001", sessionId="s-001"
    )
    service.db = SimpleNamespace(
        get_candidate_change=AsyncMock(return_value=_fake_change(status="pending")),
        get_project=AsyncMock(
            return_value=SimpleNamespace(id="p-001", currentVersionId="v-001")
        ),
        get_project_version=AsyncMock(
            return_value=SimpleNamespace(id="v-001", projectId="p-001")
        ),
        get_project_references=AsyncMock(
            return_value=[
                SimpleNamespace(
                    id="r-001",
                    targetProjectId="p-base-001",
                    relationType="base",
                    mode="follow",
                    pinnedVersionId=None,
                    priority=0,
                    status="active",
                )
            ]
        ),
        get_candidate_changes=AsyncMock(
            return_value=[_fake_change(status="pending"), sibling_change]
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
    assert update_status.await_count == 2
    accepted_call = update_status.await_args_list[0]
    superseded_call = update_status.await_args_list[1]
    assert accepted_call.args[:3] == (
        "c-001",
        CandidateChangeStatus.ACCEPTED,
        "looks good",
    )
    assert accepted_call.kwargs["reviewed_by"] == "u-reviewer-001"
    assert accepted_call.kwargs["payload"]["base_version_context"] == {
        "base_version_id": "v-001",
        "current_version_id": "v-001",
    }
    assert accepted_call.kwargs["payload"]["reference_summary"] == [
        {
            "reference_id": "r-001",
            "target_project_id": "p-base-001",
            "relation_type": "base",
            "mode": "follow",
            "pinned_version_id": None,
            "priority": 0,
            "status": "active",
        }
    ]
    assert accepted_call.kwargs["payload"]["review"] == {
        "action": CandidateChangeReviewAction.ACCEPT,
        "accepted_version_id": "v-002",
        "reviewer_user_id": "u-reviewer-001",
        "reviewed_at": ANY,
        "review_comment": "looks good",
    }
    assert superseded_call.args == (
        "c-002",
        CandidateChangeStatus.SUPERSEDED,
    )
    assert superseded_call.kwargs == {
        "review_comment": "Superseded by accepted candidate change",
    }


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
