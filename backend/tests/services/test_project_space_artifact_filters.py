from services.database.project_space_artifacts import ProjectSpaceArtifactMixin


class _ArtifactDB(ProjectSpaceArtifactMixin):
    def __init__(self):
        self.captured_where = None

        class _ArtifactActions:
            async def find_many(inner_self, *, where, take, order):
                self.captured_where = where
                return []

        class _DB:
            artifact = _ArtifactActions()

        self.db = _DB()


async def test_get_project_artifacts_can_filter_by_session_id():
    service = _ArtifactDB()

    await service.get_project_artifacts(
        "p-001",
        type_filter="pptx",
        visibility_filter="private",
        owner_user_id_filter="u-001",
        based_on_version_id_filter="v-001",
        session_id_filter="s-001",
    )

    assert service.captured_where == {
        "projectId": "p-001",
        "type": "pptx",
        "visibility": "private",
        "ownerUserId": "u-001",
        "basedOnVersionId": "v-001",
        "sessionId": "s-001",
    }
