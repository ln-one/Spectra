from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.database.projects import ProjectMixin
from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT


class _ProjectDb(ProjectMixin):
    def __init__(self):
        self.db = SimpleNamespace(
            project=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        createdAt="created",
                        updatedAt="updated",
                    )
                )
            ),
            upload=SimpleNamespace(
                count=AsyncMock(return_value=2),
                aggregate=AsyncMock(return_value={"_sum": {"size": 256}}),
            ),
            conversation=SimpleNamespace(count=AsyncMock(return_value=3)),
            generationtask=SimpleNamespace(count=AsyncMock(side_effect=[4, 2])),
        )


@pytest.mark.asyncio
async def test_project_statistics_excludes_silent_accretion_uploads():
    db = _ProjectDb()

    stats = await db.get_project_statistics("p-001")

    upload_count_where = db.db.upload.count.await_args.kwargs["where"]
    upload_sum_where = db.db.upload.aggregate.await_args.kwargs["where"]
    assert upload_count_where["projectId"] == "p-001"
    assert {"usageIntent": None} in upload_count_where["OR"]
    assert {
        "usageIntent": {"not": SILENT_ACCRETION_USAGE_INTENT}
    } in upload_count_where["OR"]
    assert upload_sum_where == upload_count_where
    assert stats["files_count"] == 2
    assert stats["total_file_size"] == 256
