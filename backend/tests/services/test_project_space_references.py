from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.project_space_service.references import create_candidate_change
from utils.exceptions import ValidationException


@pytest.mark.asyncio
async def test_create_candidate_change_defaults_base_version_from_session():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            db=SimpleNamespace(
                generationsession=SimpleNamespace(
                    find_unique=AsyncMock(
                        return_value=SimpleNamespace(
                            id="s-001", projectId="p-001", baseVersionId="v-session-001"
                        )
                    )
                )
            ),
            get_project=AsyncMock(),
            get_project_version=AsyncMock(
                return_value=SimpleNamespace(id="v-session-001", projectId="p-001")
            ),
            create_candidate_change=AsyncMock(return_value=SimpleNamespace(id="c-001")),
        ),
    )

    await create_candidate_change(
        service,
        project_id="p-001",
        user_id="u-001",
        title="candidate",
        session_id="s-001",
    )

    service.db.create_candidate_change.assert_awaited_once_with(
        project_id="p-001",
        title="candidate",
        summary=None,
        payload=None,
        session_id="s-001",
        base_version_id="v-session-001",
        proposer_user_id="u-001",
    )
    service.db.get_project.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_candidate_change_defaults_base_version_from_project_current_version():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            db=SimpleNamespace(
                generationsession=SimpleNamespace(find_unique=AsyncMock())
            ),
            get_project=AsyncMock(
                return_value=SimpleNamespace(
                    id="p-001", currentVersionId="v-current-001"
                )
            ),
            get_project_version=AsyncMock(
                return_value=SimpleNamespace(id="v-current-001", projectId="p-001")
            ),
            create_candidate_change=AsyncMock(return_value=SimpleNamespace(id="c-001")),
        ),
    )

    await create_candidate_change(
        service,
        project_id="p-001",
        user_id="u-001",
        title="candidate",
    )

    service.db.create_candidate_change.assert_awaited_once_with(
        project_id="p-001",
        title="candidate",
        summary=None,
        payload=None,
        session_id=None,
        base_version_id="v-current-001",
        proposer_user_id="u-001",
    )


@pytest.mark.asyncio
async def test_create_candidate_change_rejects_session_from_other_project():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            db=SimpleNamespace(
                generationsession=SimpleNamespace(
                    find_unique=AsyncMock(
                        return_value=SimpleNamespace(
                            id="s-001", projectId="p-other", baseVersionId=None
                        )
                    )
                )
            ),
            get_project=AsyncMock(),
            get_project_version=AsyncMock(),
            create_candidate_change=AsyncMock(),
        ),
    )

    with pytest.raises(ValidationException):
        await create_candidate_change(
            service,
            project_id="p-001",
            user_id="u-001",
            title="candidate",
            session_id="s-001",
        )

    service.db.create_candidate_change.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_candidate_change_rejects_base_version_mismatch_with_session():
    service = SimpleNamespace(
        check_project_permission=AsyncMock(),
        db=SimpleNamespace(
            db=SimpleNamespace(
                generationsession=SimpleNamespace(
                    find_unique=AsyncMock(
                        return_value=SimpleNamespace(
                            id="s-001", projectId="p-001", baseVersionId="v-session-001"
                        )
                    )
                )
            ),
            get_project=AsyncMock(),
            get_project_version=AsyncMock(),
            create_candidate_change=AsyncMock(),
        ),
    )

    with pytest.raises(
        ValidationException, match="must match the session base version"
    ):
        await create_candidate_change(
            service,
            project_id="p-001",
            user_id="u-001",
            title="candidate",
            session_id="s-001",
            base_version_id="v-other-009",
        )

    service.db.create_candidate_change.assert_not_awaited()
