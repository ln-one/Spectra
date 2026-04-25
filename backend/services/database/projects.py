import asyncio
from datetime import datetime, timezone
from typing import Optional

from schemas.project_semantics import validate_project_sharing_rules
from schemas.projects import ProjectCreate
from services.library_semantics import (
    ARTIFACT_SOURCE_USAGE_INTENT,
    SILENT_ACCRETION_USAGE_INTENT,
)
from utils.exceptions import NotFoundException


class ProjectMixin:
    @staticmethod
    def _read_field(record, field_name: str):
        if isinstance(record, dict):
            return record.get(field_name)
        return getattr(record, field_name, None)

    @staticmethod
    def _project_file_where(project_id: str) -> dict:
        return {
            "projectId": project_id,
            "OR": [
                {"usageIntent": None},
                {
                    "usageIntent": {
                        "notIn": [
                            SILENT_ACCRETION_USAGE_INTENT,
                            ARTIFACT_SOURCE_USAGE_INTENT,
                        ]
                    }
                },
            ],
        }

    async def create_project(
        self,
        project_data: ProjectCreate,
        user_id: str,
        *,
        name_override: Optional[str] = None,
        name_source: Optional[str] = None,
    ):
        visibility, is_referenceable = validate_project_sharing_rules(
            getattr(project_data, "visibility", None),
            getattr(project_data, "is_referenceable", None),
        )
        resolved_name = name_override or getattr(project_data, "name", None)
        data = {
            "name": resolved_name,
            "description": project_data.description,
            "userId": user_id,
        }
        if name_source is not None:
            data["nameSource"] = name_source
        if getattr(project_data, "grade_level", None) is not None:
            data["gradeLevel"] = project_data.grade_level
        if getattr(project_data, "visibility", None) is not None:
            data["visibility"] = visibility.value
        if getattr(project_data, "is_referenceable", None) is not None:
            data["isReferenceable"] = is_referenceable

        return await self.db.project.create(data=data)

    async def get_project(self, project_id: str):
        return await self.db.project.find_unique(where={"id": project_id})

    async def get_all_projects(self):
        return await self.db.project.find_many()

    async def get_projects_by_user(self, user_id: str, page: int, limit: int):
        skip = (page - 1) * limit
        return await self.db.project.find_many(
            where={"userId": user_id},
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_projects_by_user(self, user_id: str) -> int:
        return await self.db.project.count(where={"userId": user_id})

    async def update_project(
        self,
        project_id: str,
        name: str,
        description: str,
        grade_level: Optional[str] = None,
        visibility: Optional[str] = None,
        is_referenceable: Optional[bool] = None,
        *,
        name_source: Optional[str] = None,
    ):
        existing = await self.get_project(project_id)
        if existing is None:
            raise NotFoundException(message=f"项目不存在: {project_id}")
        resolved_visibility, resolved_referenceable = validate_project_sharing_rules(
            (
                visibility
                if visibility is not None
                else getattr(existing, "visibility", None)
            ),
            (
                is_referenceable
                if is_referenceable is not None
                else getattr(existing, "isReferenceable", None)
            ),
        )
        data: dict = {"name": name, "description": description}
        if name_source is not None:
            data["nameSource"] = name_source
            data["nameUpdatedAt"] = datetime.now(timezone.utc)
        if grade_level is not None:
            data["gradeLevel"] = grade_level
        if visibility is not None:
            data["visibility"] = resolved_visibility.value
        if is_referenceable is not None:
            data["isReferenceable"] = resolved_referenceable
        return await self.db.project.update(where={"id": project_id}, data=data)

    async def delete_project(self, project_id: str):
        return await self.db.project.delete(where={"id": project_id})

    async def search_projects(
        self,
        user_id: str,
        q: str,
        status: Optional[str],
        page: int,
        limit: int,
    ):
        skip = (page - 1) * limit
        where: dict = {
            "userId": user_id,
            "OR": [{"name": {"contains": q}}, {"description": {"contains": q}}],
        }
        if status:
            where["status"] = status
        return await self.db.project.find_many(
            where=where,
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_search_projects(
        self, user_id: str, q: str, status: Optional[str]
    ) -> int:
        where: dict = {
            "userId": user_id,
            "OR": [{"name": {"contains": q}}, {"description": {"contains": q}}],
        }
        if status:
            where["status"] = status
        return await self.db.project.count(where=where)

    async def get_project_statistics(self, project_id: str) -> dict:
        file_where = self._project_file_where(project_id)
        project, files_count, messages_count, session_count, success_count = (
            await asyncio.gather(
                self.db.project.find_unique(where={"id": project_id}),
                self.db.upload.count(where=file_where),
                self.db.conversation.count(where={"projectId": project_id}),
                self.db.generationsession.count(where={"projectId": project_id}),
                self.db.generationsession.count(
                    where={"projectId": project_id, "state": "SUCCESS"}
                ),
            )
        )
        total_file_size = 0
        aggregate_available = False
        if hasattr(self.db.upload, "aggregate"):
            try:
                size_agg = await self.db.upload.aggregate(
                    where=file_where,
                    _sum={"size": True},
                )
                aggregate_available = True
                if isinstance(size_agg, dict):
                    total_file_size = int((size_agg.get("_sum") or {}).get("size") or 0)
                else:
                    sum_payload = getattr(size_agg, "_sum", None)
                    if isinstance(sum_payload, dict):
                        total_file_size = int(sum_payload.get("size") or 0)
                    else:
                        total_file_size = int(getattr(sum_payload, "size", 0) or 0)
            except (TypeError, ValueError, AttributeError):
                aggregate_available = False
        if not aggregate_available:
            uploads = await self.db.upload.find_many(
                where=file_where,
            )
            total_file_size = sum(
                int((self._read_field(item, "size")) or 0) for item in uploads
            )
        return {
            "project_id": project_id,
            "files_count": files_count,
            "messages_count": messages_count,
            "generation_tasks_count": session_count,
            "completed_tasks_count": success_count,
            "total_file_size": total_file_size,
            "last_activity": project.updatedAt if project else None,
            "created_at": project.createdAt if project else None,
        }
