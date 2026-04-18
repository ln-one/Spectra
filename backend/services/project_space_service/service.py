"""Thin Spectra consumer facade over the remote Ourograph service."""

from __future__ import annotations

import logging
from typing import Any, Optional

from services.database import db_service
from services.ourograph_client import ourograph_base_url, ourograph_client
from utils.exceptions import ExternalServiceException

from .artifacts import create_artifact_with_file

logger = logging.getLogger(__name__)


def _missing_ourograph_error() -> ExternalServiceException:
    return ExternalServiceException(
        message=(
            "Ourograph service is required for project-space formal state. "
            "Set OUROGRAPH_BASE_URL for Spectra."
        ),
        retryable=False,
        details={"ourograph_enabled": False},
    )


class ProjectSpaceService:
    """Spectra-side consumer for Ourograph formal-state APIs."""

    def __init__(self):
        self._runtime_db = db_service
        logger.info("ProjectSpaceService initialized in remote-only mode")

    @property
    def db(self):
        return self._runtime_db

    @db.setter
    def db(self, value):
        self._runtime_db = value

    @staticmethod
    def _ensure_remote_configured() -> str:
        base_url = ourograph_base_url()
        if not base_url:
            raise _missing_ourograph_error()
        return base_url

    async def check_project_permission(
        self,
        project_id: str,
        user_id: str,
        permission,
    ) -> bool:
        self._ensure_remote_configured()
        return await ourograph_client.check_project_permission(
            project_id=project_id,
            user_id=user_id,
            permission=permission,
        )

    async def check_project_exists(self, project_id: str) -> bool:
        self._ensure_remote_configured()
        return await ourograph_client.check_project_exists(project_id=project_id)

    async def get_project_members(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_members(**kwargs)

    async def create_managed_project(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.create_managed_project(**kwargs)

    async def delete_project(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.delete_project(**kwargs)

    async def update_project_governance(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.update_project_governance(**kwargs)

    async def create_project_member(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.create_project_member(**kwargs)

    async def update_project_member(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.update_project_member(**kwargs)

    async def delete_project_member(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.delete_project_member(**kwargs)

    async def create_project_reference(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.create_project_reference(**kwargs)

    async def get_project_references(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_references(**kwargs)

    async def update_project_reference(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.update_project_reference(**kwargs)

    async def delete_project_reference(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.delete_project_reference(**kwargs)

    async def create_candidate_change(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.create_candidate_change(**kwargs)

    async def get_candidate_changes(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.get_candidate_changes(**kwargs)

    async def review_candidate_change(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.review_candidate_change(**kwargs)

    async def create_artifact(
        self,
        *,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        storage_path: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ):
        self._ensure_remote_configured()
        return await ourograph_client.create_artifact(
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            user_id=user_id,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            storage_path=storage_path,
            metadata=metadata,
        )

    async def update_artifact_metadata(
        self,
        artifact_id: str,
        metadata: dict,
        *,
        project_id: str,
        user_id: str,
    ):
        self._ensure_remote_configured()
        return await ourograph_client.update_artifact_metadata(
            project_id=project_id,
            artifact_id=artifact_id,
            user_id=user_id,
            metadata=metadata,
        )

    async def create_artifact_with_file(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id=None,
        based_on_version_id=None,
        content=None,
        artifact_mode=None,
    ):
        self._ensure_remote_configured()
        return await create_artifact_with_file(
            service=self,
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            user_id=user_id,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            content=content,
            artifact_mode=artifact_mode,
        )

    async def bind_artifact_to_version(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.bind_artifact_to_version(**kwargs)

    async def commit_project_version(self, *args, **kwargs):
        self._ensure_remote_configured()
        return await ourograph_client.commit_project_version(**kwargs)

    async def resolve_effective_project_context(self, project_id: str, user_id: str):
        self._ensure_remote_configured()
        return await ourograph_client.resolve_effective_project_context(
            project_id,
            user_id,
        )

    async def get_project_state(self, project_id: str, user_id: str):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_state(project_id, user_id)

    async def get_project_versions_with_context(self, project_id: str, user_id: str):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_versions_with_context(
            project_id,
            user_id,
        )

    async def get_project_version_with_context(
        self,
        project_id: str,
        version_id: str,
        user_id: str,
    ):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_version_with_context(
            project_id,
            version_id,
            user_id,
        )

    async def get_project_current_version_id(self, project_id: str, user_id: str):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_current_version_id(
            project_id,
            user_id,
        )

    async def get_project_artifacts(
        self,
        project_id: str,
        user_id: str,
        type_filter=None,
        visibility_filter=None,
        owner_user_id_filter=None,
        based_on_version_id_filter=None,
        session_id_filter=None,
    ):
        self._ensure_remote_configured()
        return await ourograph_client.get_project_artifacts(
            project_id,
            user_id=user_id,
            type_filter=type_filter,
            visibility_filter=visibility_filter,
            owner_user_id_filter=owner_user_id_filter,
            based_on_version_id_filter=based_on_version_id_filter,
            session_id_filter=session_id_filter,
        )

    async def get_artifact(self, artifact_id: str, user_id: Optional[str] = None):
        self._ensure_remote_configured()
        return await ourograph_client.get_artifact(artifact_id, user_id=user_id)

    async def get_idempotency_response(self, key: str):
        return await db_service.get_idempotency_response(key)

    async def save_idempotency_response(self, key: str, response: dict):
        return await db_service.save_idempotency_response(key, response)


project_space_service = ProjectSpaceService()
