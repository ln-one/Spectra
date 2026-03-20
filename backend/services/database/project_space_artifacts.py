import json
from typing import Optional

from schemas.project_space import ArtifactType, ArtifactVisibility


def _normalize_artifact_visibility(value: ArtifactVisibility | str) -> str:
    return (
        value.value
        if isinstance(value, ArtifactVisibility)
        else ArtifactVisibility(value).value
    )


class ProjectSpaceArtifactMixin:
    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[ArtifactType | str] = None,
        visibility_filter: Optional[ArtifactVisibility | str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
        session_id_filter: Optional[str] = None,
    ):
        where: dict = {"projectId": project_id}
        if type_filter:
            where["type"] = (
                type_filter.value
                if isinstance(type_filter, ArtifactType)
                else ArtifactType(type_filter).value
            )
        if visibility_filter:
            where["visibility"] = _normalize_artifact_visibility(visibility_filter)
        if owner_user_id_filter:
            where["ownerUserId"] = owner_user_id_filter
        if based_on_version_id_filter:
            where["basedOnVersionId"] = based_on_version_id_filter
        if session_id_filter:
            where["sessionId"] = session_id_filter
        return await self.db.artifact.find_many(
            where=where, order={"createdAt": "desc"}
        )

    async def get_artifact(self, artifact_id: str):
        return await self.db.artifact.find_unique(where={"id": artifact_id})

    async def create_artifact(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        owner_user_id: Optional[str] = None,
        storage_path: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        data = {
            "projectId": project_id,
            "type": artifact_type,
            "visibility": _normalize_artifact_visibility(visibility),
        }
        if session_id:
            data["sessionId"] = session_id
        if based_on_version_id:
            data["basedOnVersionId"] = based_on_version_id
        if owner_user_id:
            data["ownerUserId"] = owner_user_id
        if storage_path:
            data["storagePath"] = storage_path
        if metadata:
            data["metadata"] = json.dumps(metadata)
        return await self.db.artifact.create(data=data)

    async def update_artifact_metadata(self, artifact_id: str, metadata: dict):
        return await self.db.artifact.update(
            where={"id": artifact_id},
            data={"metadata": json.dumps(metadata)},
        )
