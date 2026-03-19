from typing import Optional

from .artifacts import create_artifact_with_file, get_artifact_storage_path


async def get_artifact_storage_path_response(
    service, project_id: str, artifact_type: str, artifact_id: str
) -> str:
    return await get_artifact_storage_path(project_id, artifact_type, artifact_id)


async def create_artifact_with_file_response(
    service,
    project_id: str,
    artifact_type: str,
    visibility: str,
    user_id: str,
    session_id: Optional[str] = None,
    based_on_version_id: Optional[str] = None,
    content: Optional[dict] = None,
):
    return await create_artifact_with_file(
        db=service.db,
        project_id=project_id,
        artifact_type=artifact_type,
        visibility=visibility,
        user_id=user_id,
        session_id=session_id,
        based_on_version_id=based_on_version_id,
        content=content,
    )


async def get_project_versions(service, project_id: str):
    return await service.db.get_project_versions(project_id)


async def get_project_version(service, version_id: str):
    return await service.db.get_project_version(version_id)


async def get_project_artifacts(
    service,
    project_id: str,
    type_filter: Optional[str] = None,
    visibility_filter: Optional[str] = None,
    owner_user_id_filter: Optional[str] = None,
    based_on_version_id_filter: Optional[str] = None,
):
    return await service.db.get_project_artifacts(
        project_id,
        type_filter,
        visibility_filter,
        owner_user_id_filter,
        based_on_version_id_filter,
    )


async def get_artifact(service, artifact_id: str):
    return await service.db.get_artifact(artifact_id)


async def get_idempotency_response(service, key: str):
    return await service.db.get_idempotency_response(key)


async def save_idempotency_response(service, key: str, response: dict):
    return await service.db.save_idempotency_response(key, response)
