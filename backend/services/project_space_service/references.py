from typing import Optional

from schemas.project_space import (
    CandidateChangeStatus,
    ProjectPermission,
    ReferenceMode,
)
from utils.exceptions import NotFoundException, ValidationException


async def create_project_reference(
    service,
    project_id: str,
    user_id: str,
    target_project_id: str,
    relation_type: str,
    mode: str,
    pinned_version_id: Optional[str] = None,
    priority: int = 0,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )
    await service.validate_reference_creation(
        project_id=project_id,
        target_project_id=target_project_id,
        relation_type=relation_type,
        mode=mode,
        pinned_version_id=pinned_version_id,
    )
    return await service.db.create_project_reference(
        project_id=project_id,
        target_project_id=target_project_id,
        relation_type=relation_type,
        mode=mode,
        pinned_version_id=pinned_version_id,
        priority=priority,
        created_by=user_id,
    )


async def get_project_references(service, project_id: str, user_id: str):
    await service.check_project_permission(project_id, user_id, ProjectPermission.VIEW)
    return await service.db.get_project_references(project_id)


async def update_project_reference(
    service,
    project_id: str,
    reference_id: str,
    user_id: str,
    mode: Optional[str] = None,
    pinned_version_id: Optional[str] = None,
    priority: Optional[int] = None,
    status: Optional[str] = None,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )

    reference = await service.db.get_project_reference(reference_id)
    if not reference or reference.projectId != project_id:
        raise NotFoundException(
            f"Reference {reference_id} not found in project {project_id}"
        )

    if mode == ReferenceMode.PINNED.value and not pinned_version_id:
        raise ValidationException("mode=pinned requires pinned_version_id")

    if mode == ReferenceMode.FOLLOW.value and pinned_version_id is None:
        pinned_version_id = None

    if pinned_version_id:
        version = await service.db.get_project_version(pinned_version_id)
        if not version or version.projectId != reference.targetProjectId:
            raise ValidationException(
                f"pinned_version_id {pinned_version_id} does not belong to "
                f"target project {reference.targetProjectId}"
            )

    if mode == ReferenceMode.FOLLOW.value:
        pinned_version_id = None

    return await service.db.update_project_reference(
        reference_id=reference_id,
        mode=mode,
        pinned_version_id=pinned_version_id,
        priority=priority,
        status=status,
    )


async def delete_project_reference(
    service,
    project_id: str,
    reference_id: str,
    user_id: str,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.MANAGE
    )
    reference = await service.db.get_project_reference(reference_id)
    if not reference or reference.projectId != project_id:
        raise NotFoundException(
            f"Reference {reference_id} not found in project {project_id}"
        )
    return await service.db.delete_project_reference(reference_id)


async def create_candidate_change(
    service,
    project_id: str,
    user_id: str,
    title: str,
    summary: Optional[str] = None,
    payload: Optional[dict] = None,
    session_id: Optional[str] = None,
    base_version_id: Optional[str] = None,
):
    await service.check_project_permission(
        project_id, user_id, ProjectPermission.COLLABORATE
    )
    if base_version_id:
        base_version = await service.db.get_project_version(base_version_id)
        if not base_version or base_version.projectId != project_id:
            raise ValidationException(
                "base_version_id "
                f"{base_version_id} does not belong to project {project_id}"
            )
    return await service.db.create_candidate_change(
        project_id=project_id,
        title=title,
        summary=summary,
        payload=payload,
        session_id=session_id,
        base_version_id=base_version_id,
        proposer_user_id=user_id,
    )


async def get_candidate_changes(
    service,
    project_id: str,
    user_id: str,
    status: Optional[CandidateChangeStatus | str] = None,
    proposer_user_id: Optional[str] = None,
    session_id: Optional[str] = None,
):
    await service.check_project_permission(project_id, user_id, ProjectPermission.VIEW)
    return await service.db.get_candidate_changes(
        project_id=project_id,
        status=status,
        proposer_user_id=proposer_user_id,
        session_id=session_id,
    )
