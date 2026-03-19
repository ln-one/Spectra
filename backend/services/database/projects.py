from typing import Optional

from schemas.generation import TaskStatus
from schemas.project_space import ReferenceRelationType
from schemas.projects import ProjectCreate, ProjectReferenceMode
from utils.exceptions import APIException, NotFoundException, ValidationException


class ProjectMixin:
    async def create_project(self, project_data: ProjectCreate, user_id: str):
        data = {
            "name": project_data.name,
            "description": project_data.description,
            "userId": user_id,
        }
        if getattr(project_data, "grade_level", None) is not None:
            data["gradeLevel"] = project_data.grade_level
        if getattr(project_data, "visibility", None) is not None:
            data["visibility"] = project_data.visibility
        if getattr(project_data, "is_referenceable", None) is not None:
            data["isReferenceable"] = project_data.is_referenceable

        project = await self.db.project.create(data=data)

        base_project_id = getattr(project_data, "base_project_id", None)
        if base_project_id:
            try:
                base_project = await self.get_project(base_project_id)
                if not base_project:
                    raise NotFoundException(
                        message=f"基底项目不存在: {base_project_id}"
                    )

                reference_mode = getattr(
                    project_data,
                    "reference_mode",
                    ProjectReferenceMode.FOLLOW,
                )
                reference_mode_value = getattr(reference_mode, "value", reference_mode)

                pinned_version_id = None
                if reference_mode_value == ProjectReferenceMode.PINNED.value:
                    pinned_version_id = getattr(base_project, "currentVersionId", None)
                    if not pinned_version_id:
                        raise ValidationException(
                            message=(
                                "reference_mode=pinned 时，"
                                "基底项目必须存在 current_version_id"
                            )
                        )

                await self.create_project_reference(
                    project_id=project.id,
                    target_project_id=base_project_id,
                    relation_type=ReferenceRelationType.BASE.value,
                    mode=reference_mode_value,
                    pinned_version_id=pinned_version_id,
                    priority=0,
                    created_by=user_id,
                )
            except APIException:
                await self.delete_project(project.id)
                raise
            except Exception as exc:
                await self.delete_project(project.id)
                raise ValidationException(message=f"创建基底引用失败: {exc}")

        return project

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
    ):
        data: dict = {"name": name, "description": description}
        if grade_level is not None:
            data["gradeLevel"] = grade_level
        if visibility is not None:
            data["visibility"] = visibility
        if is_referenceable is not None:
            data["isReferenceable"] = is_referenceable
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
        project = await self.db.project.find_unique(where={"id": project_id})
        files_count = await self.db.upload.count(where={"projectId": project_id})
        messages_count = await self.db.conversation.count(
            where={"projectId": project_id}
        )
        tasks_count = await self.db.generationtask.count(
            where={"projectId": project_id}
        )
        completed_count = await self.db.generationtask.count(
            where={"projectId": project_id, "status": TaskStatus.COMPLETED}
        )
        total_file_size = 0
        aggregate_available = False
        if hasattr(self.db.upload, "aggregate"):
            try:
                size_agg = await self.db.upload.aggregate(
                    where={"projectId": project_id},
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
                where={"projectId": project_id},
                select={"size": True},
            )
            total_file_size = sum(
                int((item.get("size") if isinstance(item, dict) else item.size) or 0)
                for item in uploads
            )
        return {
            "project_id": project_id,
            "files_count": files_count,
            "messages_count": messages_count,
            "generation_tasks_count": tasks_count,
            "completed_tasks_count": completed_count,
            "total_file_size": total_file_size,
            "last_activity": project.updatedAt if project else None,
            "created_at": project.createdAt if project else None,
        }
