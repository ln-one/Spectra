from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database.files import FileMixin
from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT


class _FileDb(FileMixin):
    def __init__(self):
        self.db = SimpleNamespace(
            upload=SimpleNamespace(
                update=AsyncMock(return_value={}),
                find_many=AsyncMock(return_value=[]),
                count=AsyncMock(return_value=0),
            )
        )


@pytest.mark.asyncio
async def test_get_project_files_excludes_silent_accretion_uploads():
    db = _FileDb()

    await db.get_project_files("p-001", page=1, limit=20)

    where = db.db.upload.find_many.await_args.kwargs["where"]
    assert where["projectId"] == "p-001"
    assert {"usageIntent": {"not": SILENT_ACCRETION_USAGE_INTENT}} in where["OR"]


@pytest.mark.asyncio
async def test_count_project_files_excludes_silent_accretion_uploads():
    db = _FileDb()

    await db.count_project_files("p-001")

    where = db.db.upload.count.await_args.kwargs["where"]
    assert where["projectId"] == "p-001"
    assert {"usageIntent": None} in where["OR"]


@pytest.mark.asyncio
async def test_update_upload_status_can_explicitly_clear_error_message():
    db = _FileDb()

    await db.update_upload_status(
        "f-001",
        status="ready",
        parse_result={"chunk_count": 1},
        error_message=None,
    )

    data = db.db.upload.update.await_args.kwargs["data"]
    assert data["status"] == "ready"
    assert data["parseResult"] == '{"chunk_count": 1}'
    assert data["errorMessage"] is None
