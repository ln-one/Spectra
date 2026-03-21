import json
from typing import Optional

from schemas.project_reference_semantics import (
    normalize_reference_mode,
    normalize_reference_relation_type,
    normalize_reference_status,
)
from schemas.project_space import (
    ChangeType,
    ReferenceMode,
    ReferenceRelationType,
    ReferenceStatus,
)
from utils.exceptions import ValidationException


class ProjectSpaceReferenceMixin:
    async def _validate_reference_pinned_version(
        self, *, target_project_id: str, pinned_version_id: Optional[str]
    ) -> None:
        if not pinned_version_id:
            return
        version = await self.get_project_version(pinned_version_id)
        if not version or getattr(version, "projectId", None) != target_project_id:
            raise ValidationException(
                "pinned_version_id "
                f"{pinned_version_id} does not belong to target project "
                f"{target_project_id}"
            )

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
        normalized_mode = normalize_reference_mode(mode).value
        if normalized_mode == ReferenceMode.PINNED.value and not pinned_version_id:
            raise ValidationException("mode=pinned requires pinned_version_id")
        await self._validate_reference_pinned_version(
            target_project_id=target_project_id,
            pinned_version_id=pinned_version_id,
        )
        data = {
            "projectId": project_id,
            "targetProjectId": target_project_id,
            "relationType": normalize_reference_relation_type(relation_type).value,
            "mode": normalized_mode,
            "priority": priority,
        }
        if pinned_version_id:
            data["pinnedVersionId"] = pinned_version_id
        if created_by:
            data["createdBy"] = created_by
        return await self.db.projectreference.create(data=data)

    async def get_project_references(self, project_id: str):
        return await self.db.projectreference.find_many(
            where={"projectId": project_id, "status": ReferenceStatus.ACTIVE.value},
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
        reference = await self.get_project_reference(reference_id)
        if not reference:
            raise ValidationException(f"reference_id {reference_id} not found")

        next_mode = (
            normalize_reference_mode(mode).value
            if mode is not None
            else getattr(reference, "mode", None)
        )
        next_pinned_version_id = (
            pinned_version_id
            if pinned_version_id is not None
            else getattr(reference, "pinnedVersionId", None)
        )
        if next_mode == ReferenceMode.PINNED.value and not next_pinned_version_id:
            raise ValidationException("mode=pinned requires pinned_version_id")
        await self._validate_reference_pinned_version(
            target_project_id=getattr(reference, "targetProjectId", None),
            pinned_version_id=next_pinned_version_id,
        )
        data = {}
        if mode is not None:
            data["mode"] = normalize_reference_mode(mode).value
        if pinned_version_id is not None:
            data["pinnedVersionId"] = pinned_version_id
        if priority is not None:
            data["priority"] = priority
        if status is not None:
            data["status"] = normalize_reference_status(status).value
        return await self.db.projectreference.update(
            where={"id": reference_id}, data=data
        )

    async def delete_project_reference(self, reference_id: str):
        return await self.db.projectreference.update(
            where={"id": reference_id},
            data={"status": ReferenceStatus.DISABLED.value},
        )

    async def get_base_reference(self, project_id: str):
        return await self.db.projectreference.find_first(
            where={
                "projectId": project_id,
                "relationType": ReferenceRelationType.BASE.value,
                "status": ReferenceStatus.ACTIVE.value,
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
        if parent_version_id:
            parent_version = await self.get_project_version(parent_version_id)
            if not parent_version or parent_version.projectId != project_id:
                raise ValidationException(
                    "parent_version_id "
                    f"{parent_version_id} does not belong to project {project_id}"
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
        version = await self.get_project_version(version_id)
        if not version or getattr(version, "projectId", None) != project_id:
            raise ValidationException(
                "current_version_id "
                f"{version_id} does not belong to project {project_id}"
            )
        return await self.db.project.update(
            where={"id": project_id},
            data={"currentVersionId": version_id},
        )
