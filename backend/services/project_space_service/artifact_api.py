"""Project space artifact and idempotency service methods."""

from __future__ import annotations

from typing import Optional

from schemas.project_space import ArtifactType, ArtifactVisibility

from .project_records import (
    create_artifact_with_file_response,
    get_artifact,
    get_artifact_storage_path_response,
    get_idempotency_response,
    get_project_current_version_id,
    get_project_artifacts,
    get_project_current_version_id,
    get_project_version,
    get_project_version_with_context,
    get_project_versions,
    get_project_versions_with_context,
    save_idempotency_response,
)


class ProjectSpaceArtifactAPIMixin:
    async def get_artifact_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        return await get_artifact_storage_path_response(
            self, project_id, artifact_type, artifact_id
        )

    async def create_artifact_with_file(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        content: Optional[dict] = None,
        artifact_mode: Optional[str] = None,
    ):
        return await create_artifact_with_file_response(
            self,
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            user_id=user_id,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            content=content,
            artifact_mode=artifact_mode,
        )

    async def get_project_versions(self, project_id: str):
        return await get_project_versions(self, project_id)

    async def get_project_version(self, version_id: str):
        return await get_project_version(self, version_id)

    async def get_project_current_version_id(self, project_id: str):
        return await get_project_current_version_id(self, project_id)

    async def get_project_versions_with_context(self, project_id: str):
        return await get_project_versions_with_context(self, project_id)

    async def get_project_version_with_context(self, project_id: str, version_id: str):
        return await get_project_version_with_context(self, project_id, version_id)

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[ArtifactType | str] = None,
        visibility_filter: Optional[ArtifactVisibility | str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
        session_id_filter: Optional[str] = None,
    ):
        return await get_project_artifacts(
            self,
            project_id,
            type_filter,
            visibility_filter,
            owner_user_id_filter,
            based_on_version_id_filter,
            session_id_filter,
        )

    async def get_artifact(self, artifact_id: str):
        return await get_artifact(self, artifact_id)

    async def get_idempotency_response(self, key: str):
        return await get_idempotency_response(self, key)

    async def save_idempotency_response(self, key: str, response: dict):
        return await save_idempotency_response(self, key, response)
