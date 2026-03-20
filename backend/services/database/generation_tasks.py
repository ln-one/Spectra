import json
from typing import Optional

from schemas.generation import TaskStatus, normalize_generation_type


class GenerationTaskMixin:
    async def create_generation_task(
        self,
        project_id: str,
        task_type: str,
        template_config: Optional[dict] = None,
        session_id: Optional[str] = None,
    ):
        input_data = None
        if template_config:
            input_data = json.dumps({"template_config": template_config})

        return await self.db.generationtask.create(
            data={
                "projectId": project_id,
                "sessionId": session_id,
                "taskType": normalize_generation_type(task_type).value,
                "status": TaskStatus.PENDING,
                "progress": 0,
                "inputData": input_data,
            }
        )

    async def get_generation_task(self, task_id: str):
        return await self.db.generationtask.find_unique(where={"id": task_id})

    async def get_latest_generation_task_by_project(
        self, project_id: str, completed_only: bool = False
    ):
        where: dict = {"projectId": project_id}
        if completed_only:
            where["status"] = TaskStatus.COMPLETED
        tasks = await self.db.generationtask.find_many(
            where=where,
            take=1,
            order={"updatedAt": "desc"},
        )
        return tasks[0] if tasks else None

    async def update_generation_task_status(
        self,
        task_id: str,
        status: TaskStatus | str,
        progress: Optional[int] = None,
        output_urls: Optional[str] = None,
        error_message: Optional[str] = None,
    ):
        normalized_status = (
            status if isinstance(status, TaskStatus) else TaskStatus(status)
        )
        update_data = {"status": normalized_status}
        if progress is not None:
            update_data["progress"] = progress
        if output_urls is not None:
            update_data["outputUrls"] = output_urls
        if error_message is not None:
            update_data["errorMessage"] = error_message
        return await self.db.generationtask.update(
            where={"id": task_id}, data=update_data
        )

    async def update_generation_task_rq_job_id(self, task_id: str, rq_job_id: str):
        return await self.db.generationtask.update(
            where={"id": task_id},
            data={"rqJobId": rq_job_id},
        )

    async def get_generation_task_by_rq_job_id(self, rq_job_id: str):
        return await self.db.generationtask.find_first(where={"rqJobId": rq_job_id})

    async def increment_task_retry_count(self, task_id: str):
        task = await self.get_generation_task(task_id)
        if task:
            return await self.db.generationtask.update(
                where={"id": task_id},
                data={"retryCount": {"increment": 1}},
            )
        return None
