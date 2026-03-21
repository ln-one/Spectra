import json
import os
from typing import Optional

from schemas.project_space import ArtifactType, ArtifactVisibility
from utils.exceptions import ValidationException

_DEFAULT_ARTIFACT_LIST_LIMIT = 200


def _artifact_list_limit() -> int:
    raw = os.getenv("ARTIFACT_LIST_MAX_LIMIT", "").strip()
    if not raw:
        return _DEFAULT_ARTIFACT_LIST_LIMIT
    try:
        parsed = int(raw)
        return parsed if parsed > 0 else _DEFAULT_ARTIFACT_LIST_LIMIT
    except ValueError:
        return _DEFAULT_ARTIFACT_LIST_LIMIT


def _normalize_artifact_visibility(value: ArtifactVisibility | str) -> str:
    return (
        value.value
        if isinstance(value, ArtifactVisibility)
        else ArtifactVisibility(value).value
    )


class ProjectSpaceArtifactMixin:
    async def _validate_artifact_session(
        self, *, project_id: str, session_id: Optional[str]
    ) -> None:
        if not session_id:
            return
        session = await self.db.generationsession.find_unique(where={"id": session_id})
        if not session or getattr(session, "projectId", None) != project_id:
            raise ValidationException(
                f"session_id {session_id} does not belong to project {project_id}"
            )

    async def _validate_artifact_version_anchor(
        self, *, project_id: str, based_on_version_id: Optional[str]
    ) -> None:
        if not based_on_version_id:
            return
        version = await self.get_project_version(based_on_version_id)
        if not version or getattr(version, "projectId", None) != project_id:
            raise ValidationException(
                "based_on_version_id "
                f"{based_on_version_id} does not belong to project {project_id}"
            )

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
        list_limit = _artifact_list_limit()
        return await self.db.artifact.find_many(
            where=where, take=list_limit, order={"createdAt": "desc"}
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
        await self._validate_artifact_session(
            project_id=project_id,
            session_id=session_id,
        )
        await self._validate_artifact_version_anchor(
            project_id=project_id,
            based_on_version_id=based_on_version_id,
        )
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
