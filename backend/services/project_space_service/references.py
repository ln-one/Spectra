from typing import Optional

from schemas.project_reference_semantics import (
    normalize_reference_mode,
    normalize_reference_status,
    resolve_reference_pin_state,
)
from schemas.project_space import (
    CandidateChangeStatus,
    ProjectPermission,
    ReferenceMode,
    ReferenceRelationType,
    ReferenceStatus,
)
from services.platform.state_transition_guard import GenerationState
from utils.exceptions import ConflictException, NotFoundException, ValidationException


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
    normalized_mode, pinned_version_id = resolve_reference_pin_state(
        mode, pinned_version_id
    )
    await service.validate_reference_creation(
        project_id=project_id,
        target_project_id=target_project_id,
        relation_type=relation_type,
        mode=normalized_mode.value,
        pinned_version_id=pinned_version_id,
    )
    return await service.db.create_project_reference(
        project_id=project_id,
        target_project_id=target_project_id,
        relation_type=relation_type,
        mode=normalized_mode.value,
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
    next_mode = getattr(reference, "mode", None)
    next_pinned_version_id = getattr(reference, "pinnedVersionId", None)
    next_status = getattr(reference, "status", None)

    if mode is not None:
        try:
            normalized_mode = normalize_reference_mode(mode)
        except ValueError as exc:
            raise ValidationException("mode 仅支持 follow 或 pinned") from exc
        mode = normalized_mode.value
        next_mode = mode

    if status is not None:
        try:
            status = normalize_reference_status(status).value
        except ValueError as exc:
            raise ValidationException("status 仅支持 active 或 disabled") from exc
        next_status = status

    if pinned_version_id is not None:
        next_pinned_version_id = pinned_version_id

    if next_mode == ReferenceMode.PINNED.value and not next_pinned_version_id:
        raise ValidationException("mode=pinned requires pinned_version_id")

    if next_pinned_version_id:
        version = await service.db.get_project_version(next_pinned_version_id)
        if not version or version.projectId != reference.targetProjectId:
            raise ValidationException(
                f"pinned_version_id {next_pinned_version_id} does not belong to "
                f"target project {reference.targetProjectId}"
            )

    if mode is not None:
        _, pinned_version_id = resolve_reference_pin_state(mode, pinned_version_id)
        next_pinned_version_id = pinned_version_id

    if next_status == ReferenceStatus.ACTIVE.value:
        await service.validate_reference_activation(
            project_id=project_id,
            reference_id=reference_id,
            target_project_id=reference.targetProjectId,
            relation_type=reference.relationType,
            mode=next_mode,
            pinned_version_id=next_pinned_version_id,
        )

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

    if (
        reference.relationType == ReferenceRelationType.BASE.value
        and getattr(reference, "status", None) != "disabled"
    ):
        project = await service.db.get_project(project_id)
        current_version_id = (
            getattr(project, "currentVersionId", None) if project else None
        )
        if current_version_id:
            sessions = await service.db.db.generationsession.find_many(
                where={"projectId": project_id, "baseVersionId": current_version_id}
            )
            active_states = {
                GenerationState.IDLE.value,
                GenerationState.CONFIGURING.value,
                GenerationState.ANALYZING.value,
                GenerationState.DRAFTING_OUTLINE.value,
                GenerationState.AWAITING_OUTLINE_CONFIRM.value,
                GenerationState.GENERATING_CONTENT.value,
                GenerationState.RENDERING.value,
            }
            if any(
                getattr(session, "state", None) in active_states for session in sessions
            ):
                raise ConflictException(
                    "Base reference is still used by active generation sessions."
                )

            pending_changes = await service.db.get_candidate_changes(
                project_id=project_id,
                status=CandidateChangeStatus.PENDING,
            )
            if any(
                getattr(change, "baseVersionId", None) == current_version_id
                for change in pending_changes
            ):
                raise ConflictException(
                    "Base reference is still used by pending candidate changes."
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

    project = None
    if session_id:
        session = await service.db.db.generationsession.find_unique(
            where={"id": session_id}
        )
        if not session or session.projectId != project_id:
            raise ValidationException(
                f"session_id {session_id} does not belong to project {project_id}"
            )
        session_base_version_id = getattr(session, "baseVersionId", None)
        if (
            base_version_id is not None
            and session_base_version_id is not None
            and base_version_id != session_base_version_id
        ):
            raise ValidationException(
                "base_version_id must match the session base version "
                "when session_id is provided"
            )
        if base_version_id is None:
            base_version_id = session_base_version_id

    if base_version_id is None:
        project = await service.db.get_project(project_id)
        base_version_id = (
            getattr(project, "currentVersionId", None) if project else None
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
