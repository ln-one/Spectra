from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from schemas.projects import ProjectCreate
from services.application import project_api
from services.database import db_service
from utils.exceptions import ConflictException, InternalServerException, ValidationException


def _project(**overrides):
    data = {
        "id": "p-001",
        "name": "Project A",
        "description": "desc",
        "visibility": "private",
        "isReferenceable": False,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_create_project_response_creates_formal_project_then_bootstrap(
    monkeypatch,
):
    create_project = AsyncMock(return_value=_project())
    delete_project = AsyncMock(return_value=None)
    save_idempotency = AsyncMock(return_value=None)
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(db_service, "create_project", create_project)
    monkeypatch.setattr(db_service, "delete_project", delete_project)
    monkeypatch.setattr(db_service, "save_idempotency_response", save_idempotency)
    create_formal = AsyncMock(return_value=None)
    bootstrap = AsyncMock(return_value=None)
    monkeypatch.setattr(project_api, "_create_formal_project", create_formal)
    monkeypatch.setattr(
        project_api, "_create_base_reference_if_needed", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(project_api, "_bootstrap_default_session", bootstrap)

    body = ProjectCreate(name="Project A", description="desc")

    response = await project_api.create_project_response(body, "u-1", None)

    assert response["success"] is True
    create_formal.assert_awaited_once()
    bootstrap.assert_awaited_once_with("p-001", "u-1")
    delete_project.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_project_response_rolls_back_when_formal_project_creation_fails(
    monkeypatch,
):
    create_project = AsyncMock(return_value=_project())
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(db_service, "create_project", create_project)
    monkeypatch.setattr(db_service, "delete_project", delete_project)
    monkeypatch.setattr(
        project_api,
        "_create_formal_project",
        AsyncMock(side_effect=ConflictException(message="formal conflict")),
    )
    monkeypatch.setattr(
        project_api, "_create_base_reference_if_needed", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        project_api, "_bootstrap_default_session", AsyncMock(return_value=None)
    )

    body = ProjectCreate(name="Project A", description="desc")

    with pytest.raises(ConflictException):
        await project_api.create_project_response(body, "u-1", None)

    delete_project.assert_awaited_once_with("p-001")


@pytest.mark.asyncio
async def test_create_project_response_rolls_back_formal_project_when_later_step_fails(
    monkeypatch,
):
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        db_service, "create_project", AsyncMock(return_value=_project())
    )
    monkeypatch.setattr(db_service, "delete_project", AsyncMock(return_value=None))
    monkeypatch.setattr(
        project_api, "_create_formal_project", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        project_api, "_create_base_reference_if_needed", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        project_api,
        "_bootstrap_default_session",
        AsyncMock(side_effect=RuntimeError("bootstrap failed")),
    )
    delete_formal = AsyncMock(return_value=None)
    monkeypatch.setattr(project_api, "_delete_formal_project", delete_formal)

    body = ProjectCreate(name="Project A", description="desc")

    with pytest.raises(RuntimeError):
        await project_api.create_project_response(body, "u-1", None)

    delete_formal.assert_awaited_once_with("p-001", "u-1")


@pytest.mark.asyncio
async def test_create_project_response_creates_base_reference_after_formal_project(
    monkeypatch,
):
    created = _project(id="p-new")
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(db_service, "create_project", AsyncMock(return_value=created))
    monkeypatch.setattr(db_service, "delete_project", AsyncMock(return_value=None))
    monkeypatch.setattr(
        db_service, "save_idempotency_response", AsyncMock(return_value=None)
    )

    call_order: list[str] = []

    async def record_formal(*args, **kwargs):
        call_order.append("formal")

    async def record_reference(*args, **kwargs):
        call_order.append("reference")

    async def record_bootstrap(*args, **kwargs):
        call_order.append("bootstrap")

    monkeypatch.setattr(project_api, "_create_formal_project", record_formal)
    monkeypatch.setattr(
        project_api, "_create_base_reference_if_needed", record_reference
    )
    monkeypatch.setattr(project_api, "_bootstrap_default_session", record_bootstrap)

    body = ProjectCreate(
        name="Project A",
        description="desc",
        base_project_id="base-001",
        reference_mode="follow",
    )

    await project_api.create_project_response(body, "u-1", None)

    assert call_order == ["formal", "reference", "bootstrap"]


@pytest.mark.asyncio
async def test_create_base_reference_if_needed_uses_pinned_version(monkeypatch):
    project = _project(id="p-new")
    body = ProjectCreate(
        name="Project A",
        description="desc",
        base_project_id="base-001",
        reference_mode="pinned",
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="base-001",
                currentVersionId="v-1",
                isReferenceable=True,
            )
        ),
    )
    create_reference = AsyncMock(return_value=None)
    monkeypatch.setattr(
        project_api.project_space_service,
        "create_project_reference",
        create_reference,
    )

    await project_api._create_base_reference_if_needed(project, body, "u-1")

    create_reference.assert_awaited_once_with(
        project_id="p-new",
        target_project_id="base-001",
        relation_type="base",
        mode="pinned",
        pinned_version_id="v-1",
        priority=0,
        user_id="u-1",
    )


@pytest.mark.asyncio
async def test_create_base_reference_if_needed_requires_current_version_for_pinned(
    monkeypatch,
):
    project = _project(id="p-new")
    body = ProjectCreate(
        name="Project A",
        description="desc",
        base_project_id="base-001",
        reference_mode="pinned",
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(return_value=SimpleNamespace(id="base-001", currentVersionId=None)),
    )

    with pytest.raises(ValidationException):
        await project_api._create_base_reference_if_needed(project, body, "u-1")


@pytest.mark.asyncio
async def test_create_base_reference_if_needed_requires_referenceable_target(
    monkeypatch,
):
    project = _project(id="p-new")
    body = ProjectCreate(
        name="Project A",
        description="desc",
        base_project_id="base-001",
        reference_mode="follow",
    )
    monkeypatch.setattr(
        db_service,
        "get_project",
        AsyncMock(
            return_value=SimpleNamespace(
                id="base-001",
                currentVersionId="v-1",
                isReferenceable=False,
            )
        ),
    )
    create_reference = AsyncMock(return_value=None)
    monkeypatch.setattr(
        project_api.project_space_service,
        "create_project_reference",
        create_reference,
    )

    with pytest.raises(ValidationException) as exc_info:
        await project_api._create_base_reference_if_needed(project, body, "u-1")

    assert exc_info.value.message == "所选基底项目当前不可引用，请选择标记为“可引用”的项目。"
    create_reference.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_project_response_syncs_formal_governance_after_db(monkeypatch):
    existing = _project(
        name="Old Name",
        description="old desc",
        visibility="private",
        isReferenceable=False,
        gradeLevel="初中",
    )
    updated = _project(
        name="New Name",
        description="new desc",
        visibility="shared",
        isReferenceable=True,
        gradeLevel="高中",
    )
    body = SimpleNamespace(
        name="New Name",
        description="new desc",
        grade_level="高中",
        visibility="shared",
        is_referenceable=True,
    )
    update_db = AsyncMock(return_value=updated)
    update_governance = AsyncMock(return_value=None)

    monkeypatch.setattr(project_api, "get_owned_project", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(db_service, "update_project", update_db)
    monkeypatch.setattr(
        project_api.project_space_service,
        "update_project_governance",
        update_governance,
    )
    monkeypatch.setattr(
        db_service, "save_idempotency_response", AsyncMock(return_value=None)
    )

    response = await project_api.update_project_response("p-001", body, "u-1", None)

    assert response["success"] is True
    update_db.assert_awaited_once_with(
        project_id="p-001",
        name="New Name",
        description="new desc",
        grade_level="高中",
        visibility="shared",
        is_referenceable=True,
        name_source="manual",
    )
    update_governance.assert_awaited_once_with(
        project_id="p-001",
        user_id="u-1",
        description="new desc",
        visibility="shared",
        is_referenceable=True,
    )


@pytest.mark.asyncio
async def test_update_project_response_rolls_back_db_when_formal_governance_fails(
    monkeypatch,
):
    existing = _project(
        name="Old Name",
        description="old desc",
        visibility="private",
        isReferenceable=False,
        gradeLevel="初中",
    )
    body = SimpleNamespace(
        name="New Name",
        description="new desc",
        grade_level="高中",
        visibility="shared",
        is_referenceable=True,
    )
    update_db = AsyncMock(
        side_effect=[
            _project(
                name="New Name",
                description="new desc",
                visibility="shared",
                isReferenceable=True,
                gradeLevel="高中",
            ),
            existing,
        ]
    )

    monkeypatch.setattr(project_api, "get_owned_project", AsyncMock(return_value=existing))
    monkeypatch.setattr(
        db_service, "get_idempotency_response", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(db_service, "update_project", update_db)
    monkeypatch.setattr(
        project_api.project_space_service,
        "update_project_governance",
        AsyncMock(side_effect=ConflictException(message="formal conflict")),
    )

    with pytest.raises(ConflictException):
        await project_api.update_project_response("p-001", body, "u-1", None)

    assert update_db.await_count == 2
    first_call = update_db.await_args_list[0]
    second_call = update_db.await_args_list[1]
    assert first_call.kwargs == {
        "project_id": "p-001",
        "name": "New Name",
        "description": "new desc",
        "grade_level": "高中",
        "visibility": "shared",
        "is_referenceable": True,
        "name_source": "manual",
    }
    assert second_call.kwargs == {
        "project_id": "p-001",
        "name": "Old Name",
        "description": "old desc",
        "grade_level": "初中",
        "visibility": "private",
        "is_referenceable": False,
        "name_source": None,
    }


@pytest.mark.asyncio
async def test_delete_project_response_deletes_formal_project_before_db(
    monkeypatch,
):
    call_order: list[str] = []

    monkeypatch.setattr(
        project_api,
        "get_owned_project",
        AsyncMock(return_value=_project()),
    )

    async def delete_formal(project_id: str, user_id: str):
        call_order.append(f"formal:{project_id}:{user_id}")

    async def delete_db(project_id: str):
        call_order.append(f"db:{project_id}")

    monkeypatch.setattr(project_api, "_delete_formal_project", delete_formal)
    monkeypatch.setattr(db_service, "delete_project", delete_db)

    response = await project_api.delete_project_response("p-001", "u-1")

    assert response["success"] is True
    assert call_order == ["formal:p-001:u-1", "db:p-001"]


@pytest.mark.asyncio
async def test_delete_project_response_stops_when_formal_delete_fails(monkeypatch):
    monkeypatch.setattr(
        project_api,
        "get_owned_project",
        AsyncMock(return_value=_project()),
    )
    monkeypatch.setattr(
        project_api,
        "_delete_formal_project",
        AsyncMock(side_effect=ConflictException(message="formal conflict")),
    )
    delete_project = AsyncMock(return_value=None)
    monkeypatch.setattr(db_service, "delete_project", delete_project)

    with pytest.raises(ConflictException):
        await project_api.delete_project_response("p-001", "u-1")

    delete_project.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_project_response_wraps_database_delete_failure(monkeypatch):
    monkeypatch.setattr(
        project_api,
        "get_owned_project",
        AsyncMock(return_value=_project()),
    )
    monkeypatch.setattr(
        project_api,
        "_delete_formal_project",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        db_service,
        "delete_project",
        AsyncMock(side_effect=RuntimeError("db down")),
    )

    with pytest.raises(InternalServerException) as exc_info:
        await project_api.delete_project_response("p-001", "u-1")

    assert exc_info.value.message == "删除项目失败"
    assert exc_info.value.details == {"project_id": "p-001", "stage": "database"}
