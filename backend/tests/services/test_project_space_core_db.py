from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.projects import ProjectCreate
from services.database import DatabaseService
from utils.exceptions import ValidationException


@pytest.mark.asyncio
async def test_create_project_with_base_reference_follow_success(monkeypatch):
    service = DatabaseService()
    project = SimpleNamespace(id="p-new")
    base_project = SimpleNamespace(id="p-base", currentVersionId="v-current")

    service.db = SimpleNamespace(
        project=SimpleNamespace(create=AsyncMock(return_value=project))
    )
    monkeypatch.setattr(service, "get_project", AsyncMock(return_value=base_project))
    create_reference = AsyncMock(return_value=SimpleNamespace(id="r-1"))
    monkeypatch.setattr(service, "create_project_reference", create_reference)
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(service, "delete_project", delete_project)

    body = ProjectCreate(
        name="new project",
        description="desc",
        base_project_id="p-base",
        reference_mode="follow",
        visibility="private",
        is_referenceable=False,
    )
    result = await service.create_project(body, user_id="u-1")

    assert result.id == "p-new"
    create_reference.assert_awaited_once_with(
        project_id="p-new",
        target_project_id="p-base",
        relation_type="base",
        mode="follow",
        pinned_version_id=None,
        priority=0,
        created_by="u-1",
    )
    delete_project.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_with_base_reference_pinned_requires_version(monkeypatch):
    service = DatabaseService()
    project = SimpleNamespace(id="p-new")
    base_project = SimpleNamespace(id="p-base", currentVersionId=None)

    service.db = SimpleNamespace(
        project=SimpleNamespace(create=AsyncMock(return_value=project))
    )
    monkeypatch.setattr(service, "get_project", AsyncMock(return_value=base_project))
    monkeypatch.setattr(
        service,
        "create_project_reference",
        AsyncMock(return_value=SimpleNamespace(id="r-1")),
    )
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(service, "delete_project", delete_project)

    body = ProjectCreate(
        name="new project",
        description="desc",
        base_project_id="p-base",
        reference_mode="pinned",
    )

    with pytest.raises(ValidationException):
        await service.create_project(body, user_id="u-1")

    delete_project.assert_awaited_once_with("p-new")


@pytest.mark.asyncio
async def test_update_candidate_change_status_persists_review_comment():
    service = DatabaseService()
    update_change = AsyncMock(return_value=SimpleNamespace(id="c-001"))
    service.db = SimpleNamespace(
        candidatechange=SimpleNamespace(update=update_change),
    )

    await service.update_candidate_change_status(
        change_id="c-001",
        status="accepted",
        review_comment="looks good",
        payload={"review": {"accepted_version_id": "v-001"}},
    )

    update_change.assert_awaited_once_with(
        where={"id": "c-001"},
        data={
            "status": "accepted",
            "reviewComment": "looks good",
            "payload": '{"review": {"accepted_version_id": "v-001"}}',
        },
    )


@pytest.mark.asyncio
async def test_create_project_member_applies_role_default_permissions():
    service = DatabaseService()
    create_member = AsyncMock(return_value=SimpleNamespace(id="m-001"))
    service.db = SimpleNamespace(projectmember=SimpleNamespace(create=create_member))

    await service.create_project_member(
        project_id="p-001",
        user_id="u-002",
        role="editor",
        permissions=None,
    )

    assert create_member.await_args.kwargs["data"] == {
        "projectId": "p-001",
        "userId": "u-002",
        "role": "editor",
        "permissions": '{"can_view": true, "can_reference": true, "can_collaborate": true, "can_manage": false}',
    }


@pytest.mark.asyncio
async def test_update_project_member_normalizes_permissions_and_status():
    service = DatabaseService()
    update_member = AsyncMock(return_value=SimpleNamespace(id="m-001"))
    service.db = SimpleNamespace(projectmember=SimpleNamespace(update=update_member))

    await service.update_project_member(
        member_id="m-001",
        role="viewer",
        permissions={"can_view": 1, "unknown": True},
        status="disabled",
    )

    assert update_member.await_args.kwargs["data"] == {
        "role": "viewer",
        "permissions": '{"can_view": true}',
        "status": "disabled",
    }


@pytest.mark.asyncio
async def test_get_project_members_filters_active_member_status():
    service = DatabaseService()
    find_many = AsyncMock(return_value=[])
    service.db = SimpleNamespace(projectmember=SimpleNamespace(find_many=find_many))

    await service.get_project_members("p-001")

    assert find_many.await_args.kwargs == {
        "where": {"projectId": "p-001", "status": "active"},
        "order": {"createdAt": "asc"},
    }
