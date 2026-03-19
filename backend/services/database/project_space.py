import json
from typing import Optional

from schemas.project_space import (
    ArtifactVisibility,
    CandidateChangeStatus,
    ChangeType,
    ProjectMemberRole,
    ProjectMemberStatus,
    ReferenceRelationType,
    ReferenceStatus,
)


def _normalize_artifact_visibility(value: ArtifactVisibility | str) -> str:
    return (
        value.value
        if isinstance(value, ArtifactVisibility)
        else ArtifactVisibility(value).value
    )


class ProjectSpaceMixin:
    async def create_project_reference(
        self,
        project_id: str,
        target_project_id: str,
        relation_type: str,
        mode: str,
        pinned_version_id: Optional[str],
        priority: int,
        created_by: Optional[str],
    ):
        data = {
            "projectId": project_id,
            "targetProjectId": target_project_id,
            "relationType": relation_type,
            "mode": mode,
            "priority": priority,
        }
        if pinned_version_id:
            data["pinnedVersionId"] = pinned_version_id
        if created_by:
            data["createdBy"] = created_by
        return await self.db.projectreference.create(data=data)

    async def get_project_references(self, project_id: str):
        return await self.db.projectreference.find_many(
            where={"projectId": project_id, "status": ReferenceStatus.ACTIVE},
            order={"priority": "asc"},
        )

    async def get_project_reference(self, reference_id: str):
        return await self.db.projectreference.find_unique(where={"id": reference_id})

    async def update_project_reference(
        self,
        reference_id: str,
        mode: Optional[str] = None,
        pinned_version_id: Optional[str] = None,
        priority: Optional[int] = None,
        status: Optional[str] = None,
    ):
        data = {}
        if mode is not None:
            data["mode"] = mode
        if pinned_version_id is not None:
            data["pinnedVersionId"] = pinned_version_id
        if priority is not None:
            data["priority"] = priority
        if status is not None:
            data["status"] = status
        return await self.db.projectreference.update(
            where={"id": reference_id}, data=data
        )

    async def delete_project_reference(self, reference_id: str):
        return await self.db.projectreference.update(
            where={"id": reference_id},
            data={"status": ReferenceStatus.DISABLED},
        )

    async def get_base_reference(self, project_id: str):
        return await self.db.projectreference.find_first(
            where={
                "projectId": project_id,
                "relationType": ReferenceRelationType.BASE,
                "status": ReferenceStatus.ACTIVE,
            }
        )

    async def get_project_versions(self, project_id: str):
        return await self.db.projectversion.find_many(
            where={"projectId": project_id},
            order={"createdAt": "desc"},
        )

    async def get_project_version(self, version_id: str):
        return await self.db.projectversion.find_unique(where={"id": version_id})

    async def create_project_version(
        self,
        project_id: str,
        parent_version_id: Optional[str],
        summary: Optional[str],
        change_type: str,
        snapshot_data: Optional[dict],
        created_by: Optional[str],
    ):
        normalized_change_type = (
            change_type
            if isinstance(change_type, ChangeType)
            else ChangeType(change_type)
        )
        data = {"projectId": project_id, "changeType": normalized_change_type}
        if parent_version_id:
            data["parentVersionId"] = parent_version_id
        if summary:
            data["summary"] = summary
        if snapshot_data:
            data["snapshotData"] = json.dumps(snapshot_data)
        if created_by:
            data["createdBy"] = created_by
        return await self.db.projectversion.create(data=data)

    async def update_project_current_version(self, project_id: str, version_id: str):
        return await self.db.project.update(
            where={"id": project_id},
            data={"currentVersionId": version_id},
        )

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
    ):
        where: dict = {"projectId": project_id}
        if type_filter:
            where["type"] = type_filter
        if visibility_filter:
            where["visibility"] = _normalize_artifact_visibility(visibility_filter)
        if owner_user_id_filter:
            where["ownerUserId"] = owner_user_id_filter
        if based_on_version_id_filter:
            where["basedOnVersionId"] = based_on_version_id_filter
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

    async def get_candidate_changes(
        self,
        project_id: str,
        status: Optional[str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        where: dict = {"projectId": project_id}
        if status:
            where["status"] = status
        if proposer_user_id:
            where["proposerUserId"] = proposer_user_id
        if session_id:
            where["sessionId"] = session_id
        return await self.db.candidatechange.find_many(
            where=where, order={"createdAt": "desc"}
        )

    async def get_candidate_change(self, change_id: str):
        return await self.db.candidatechange.find_unique(where={"id": change_id})

    async def create_candidate_change(
        self,
        project_id: str,
        title: str,
        summary: Optional[str],
        payload: Optional[dict],
        session_id: Optional[str],
        base_version_id: Optional[str],
        proposer_user_id: Optional[str],
    ):
        data = {"projectId": project_id, "title": title}
        if summary:
            data["summary"] = summary
        if payload:
            data["payload"] = json.dumps(payload)
        if session_id:
            data["sessionId"] = session_id
        if base_version_id:
            data["baseVersionId"] = base_version_id
        if proposer_user_id:
            data["proposerUserId"] = proposer_user_id
        return await self.db.candidatechange.create(data=data)

    async def update_candidate_change_status(
        self,
        change_id: str,
        status: CandidateChangeStatus | str,
        review_comment: Optional[str] = None,
        payload: Optional[dict] = None,
    ):
        normalized_status = (
            status
            if isinstance(status, CandidateChangeStatus)
            else CandidateChangeStatus(status)
        )
        data = {"status": normalized_status}
        if review_comment is not None:
            data["reviewComment"] = review_comment
        if payload is not None:
            data["payload"] = json.dumps(payload)
        return await self.db.candidatechange.update(where={"id": change_id}, data=data)

    async def get_project_members(self, project_id: str):
        return await self.db.projectmember.find_many(
            where={"projectId": project_id, "status": ReferenceStatus.ACTIVE},
            order={"createdAt": "asc"},
        )

    async def get_project_member(self, member_id: str):
        return await self.db.projectmember.find_unique(where={"id": member_id})

    async def get_project_member_by_user(self, project_id: str, user_id: str):
        return await self.db.projectmember.find_first(
            where={
                "projectId": project_id,
                "userId": user_id,
                "status": ProjectMemberStatus.ACTIVE,
            }
        )

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        role: ProjectMemberRole | str,
        permissions: Optional[dict],
    ):
        normalized_role = (
            role if isinstance(role, ProjectMemberRole) else ProjectMemberRole(role)
        )
        data = {"projectId": project_id, "userId": user_id, "role": normalized_role}
        if permissions:
            data["permissions"] = json.dumps(permissions)
        return await self.db.projectmember.create(data=data)

    async def update_project_member(
        self,
        member_id: str,
        role: Optional[ProjectMemberRole | str] = None,
        permissions: Optional[dict] = None,
        status: Optional[ProjectMemberStatus | str] = None,
    ):
        data = {}
        if role is not None:
            data["role"] = (
                role if isinstance(role, ProjectMemberRole) else ProjectMemberRole(role)
            )
        if permissions is not None:
            data["permissions"] = json.dumps(permissions)
        if status is not None:
            data["status"] = (
                status
                if isinstance(status, ProjectMemberStatus)
                else ProjectMemberStatus(status)
            )
        return await self.db.projectmember.update(where={"id": member_id}, data=data)

    async def delete_project_member(self, member_id: str):
        return await self.db.projectmember.delete(where={"id": member_id})
