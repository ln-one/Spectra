import json
from typing import Optional

from prisma import Prisma
from schemas.courses import CourseCreate, ProjectCreate


class DatabaseService:
    """Service for database operations using Prisma"""

    def __init__(self):
        self.db = Prisma()

    async def connect(self):
        """Connect to database"""
        await self.db.connect()

    async def disconnect(self):
        """Disconnect from database"""
        await self.db.disconnect()

    async def create_course(self, course_data: CourseCreate):
        """Create a new course"""
        chapters_json = json.dumps(
            [chapter.model_dump() for chapter in course_data.chapters]
        )
        course = await self.db.course.create(
            data={
                "title": course_data.title,
                "chapters": chapters_json,
            }
        )
        return course

    async def get_course(self, course_id: str):
        """Get a course by ID"""
        return await self.db.course.find_unique(where={"id": course_id})

    async def get_all_courses(self):
        """Get all courses"""
        return await self.db.course.find_many()

    async def create_project(self, project_data: ProjectCreate, user_id: str):
        """
        Create a new project

        Args:
            project_data: Project creation data
            user_id: User ID who owns the project
        """
        project = await self.db.project.create(
            data={
                "name": project_data.name,
                "description": project_data.description,
                "userId": user_id,
            }
        )
        return project

    async def get_project(self, project_id: str):
        """Get a project by ID"""
        return await self.db.project.find_unique(where={"id": project_id})

    async def get_all_projects(self):
        """Get all projects"""
        return await self.db.project.find_many()

    async def get_projects_by_user(self, user_id: str, page: int, limit: int):
        """Get projects by user with pagination."""
        skip = (page - 1) * limit
        return await self.db.project.find_many(
            where={"userId": user_id},
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_projects_by_user(self, user_id: str) -> int:
        """Count projects by user."""
        return await self.db.project.count(where={"userId": user_id})

    async def create_upload(
        self,
        filename: str,
        filepath: str,
        size: int,
        project_id: str,
        file_type: str,
        mime_type: Optional[str] = None,
    ):
        """
        Record a file upload

        Args:
            filename: Original filename
            filepath: Stored file path
            size: File size in bytes
            project_id: Project ID this upload belongs to
            file_type: Type of file (pdf/docx/pptx/video/other)
        """
        upload = await self.db.upload.create(
            data={
                "filename": filename,
                "filepath": filepath,
                "size": size,
                "projectId": project_id,
                "fileType": file_type,
                "mimeType": mime_type,
            }
        )
        return upload

    async def get_project_files(self, project_id: str, page: int, limit: int):
        """Get project files with pagination."""
        skip = (page - 1) * limit
        return await self.db.upload.find_many(
            where={"projectId": project_id},
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_project_files(self, project_id: str) -> int:
        """Count files in a project."""
        return await self.db.upload.count(where={"projectId": project_id})

    async def get_file(self, file_id: str):
        """Get file by ID."""
        return await self.db.upload.find_unique(where={"id": file_id})

    async def update_file_intent(self, file_id: str, usage_intent: str):
        """Update file usage intent."""
        return await self.db.upload.update(
            where={"id": file_id},
            data={"usageIntent": usage_intent},
        )

    async def delete_file(self, file_id: str):
        """Delete file record by ID."""
        return await self.db.upload.delete(where={"id": file_id})

    async def update_upload_status(
        self,
        file_id: str,
        status: str,
        parse_result: Optional[dict] = None,
        error_message: Optional[str] = None,
    ):
        """Update upload parsing status and result."""
        data: dict = {"status": status}
        if parse_result is not None:
            data["parseResult"] = json.dumps(parse_result)
        if error_message is not None:
            data["errorMessage"] = error_message
        return await self.db.upload.update(where={"id": file_id}, data=data)

    async def create_parsed_chunks(
        self,
        upload_id: str,
        source_type: str,
        chunks: list[dict],
    ):
        """Persist parsed chunks for one upload."""
        created = []
        for idx, chunk in enumerate(chunks):
            item = await self.db.parsedchunk.create(
                data={
                    "uploadId": upload_id,
                    "content": chunk["content"],
                    "chunkIndex": chunk.get("chunk_index", idx),
                    "metadata": json.dumps(chunk.get("metadata", {})),
                    "sourceType": source_type,
                }
            )
            created.append(item)
        return created

    async def delete_parsed_chunks(self, upload_id: str) -> int:
        """Delete all ParsedChunk records associated with the given upload."""
        result = await self.db.parsedchunk.delete_many(where={"uploadId": upload_id})
        return int(result)

    async def get_idempotency_response(self, key: str):
        """Get cached idempotency response if it exists."""
        record = await self.db.idempotencykey.find_unique(where={"key": key})
        if not record:
            return None
        try:
            return json.loads(record.response)
        except (TypeError, json.JSONDecodeError):
            return None

    async def save_idempotency_response(self, key: str, response: dict):
        """Persist idempotency response payload."""
        return await self.db.idempotencykey.upsert(
            where={"key": key},
            data={
                "create": {"key": key, "response": json.dumps(response)},
                "update": {"response": json.dumps(response)},
            },
        )

    async def update_project(
        self,
        project_id: str,
        name: str,
        description: str,
        grade_level: Optional[str] = None,
    ):
        """Update project name/description/grade_level."""
        data: dict = {"name": name, "description": description}
        if grade_level is not None:
            data["gradeLevel"] = grade_level
        return await self.db.project.update(
            where={"id": project_id},
            data=data,
        )

    async def delete_project(self, project_id: str):
        """Delete a project (cascades to uploads/tasks/conversations via Prisma)."""
        return await self.db.project.delete(where={"id": project_id})

    async def search_projects(
        self,
        user_id: str,
        q: str,
        status: Optional[str],
        page: int,
        limit: int,
    ):
        """Search projects by keyword in name or description."""
        skip = (page - 1) * limit
        where: dict = {
            "userId": user_id,
            "OR": [
                {"name": {"contains": q}},
                {"description": {"contains": q}},
            ],
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
        self,
        user_id: str,
        q: str,
        status: Optional[str],
    ) -> int:
        """Count search results."""
        where: dict = {
            "userId": user_id,
            "OR": [
                {"name": {"contains": q}},
                {"description": {"contains": q}},
            ],
        }
        if status:
            where["status"] = status
        return await self.db.project.count(where=where)

    async def get_project_statistics(self, project_id: str) -> dict:
        """Aggregate statistics for a project."""
        project = await self.db.project.find_unique(where={"id": project_id})
        files_count = await self.db.upload.count(where={"projectId": project_id})
        messages_count = await self.db.conversation.count(
            where={"projectId": project_id}
        )
        tasks_count = await self.db.generationtask.count(
            where={"projectId": project_id}
        )
        completed_count = await self.db.generationtask.count(
            where={"projectId": project_id, "status": "completed"}
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

    # ============================================
    # User Methods
    # ============================================

    async def create_user(
        self,
        email: str,
        password_hash: str,
        username: str,
        full_name: Optional[str] = None,
    ):
        """Create a new user"""
        return await self.db.user.create(
            data={
                "email": email,
                "password": password_hash,
                "username": username,
                "fullName": full_name,
            }
        )

    async def get_user_by_email(self, email: str):
        """Get a user by email"""
        return await self.db.user.find_unique(where={"email": email})

    async def get_user_by_username(self, username: str):
        """Get a user by username"""
        return await self.db.user.find_unique(where={"username": username})

    async def get_user_by_id(self, user_id: str):
        """Get a user by ID"""
        return await self.db.user.find_unique(where={"id": user_id})

    # ============================================
    # Conversation Methods
    # ============================================

    async def create_conversation_message(
        self,
        project_id: str,
        role: str,
        content: str,
        metadata: Optional[dict] = None,
        session_id: Optional[str] = None,
    ):
        """Create a conversation message."""
        data: dict = {
            "projectId": project_id,
            "role": role,
            "content": content,
            "metadata": json.dumps(metadata) if metadata else None,
        }
        if session_id:
            data["sessionId"] = session_id
        return await self.db.conversation.create(data=data)

    async def get_conversation_messages(
        self,
        project_id: str,
        page: int,
        limit: int,
        session_id: Optional[str] = None,
    ):
        """Get conversation messages by project with pagination."""
        skip = (page - 1) * limit
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        return await self.db.conversation.find_many(
            where=where,
            skip=skip,
            take=limit,
            order={"createdAt": "asc"},
        )

    async def get_recent_conversation_messages(
        self,
        project_id: str,
        limit: int = 10,
        session_id: Optional[str] = None,
    ):
        """Get latest messages by project in chronological order."""
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        messages = await self.db.conversation.find_many(
            where=where,
            take=limit,
            order={"createdAt": "desc"},
        )
        return list(reversed(messages))

    async def get_messages(self, project_id: str, limit: int = 10):
        """Backward-compatible alias for recent conversation messages."""
        return await self.get_recent_conversation_messages(
            project_id=project_id, limit=limit
        )

    async def count_conversation_messages(
        self,
        project_id: str,
        session_id: Optional[str] = None,
    ) -> int:
        """Count conversation messages in a project."""
        where: dict = {"projectId": project_id}
        if session_id:
            where["sessionId"] = session_id
        return await self.db.conversation.count(where=where)

    async def get_conversations_paginated(
        self,
        project_id: str,
        page: int = 1,
        limit: int = 20,
        session_id: Optional[str] = None,
    ):
        """Return (messages, total) for a project with pagination."""
        messages = await self.get_conversation_messages(
            project_id=project_id, page=page, limit=limit, session_id=session_id
        )
        total = await self.count_conversation_messages(
            project_id=project_id, session_id=session_id
        )
        return messages, total

    # ============================================
    # Generation Task Methods
    # ============================================

    async def create_generation_task(
        self,
        project_id: str,
        task_type: str,
        template_config: Optional[dict] = None,
        session_id: Optional[str] = None,
    ):
        """
        Create a new generation task

        Args:
            project_id: Project ID
            task_type: Task type (pptx/docx/both)
            template_config: Template configuration (optional)

        Returns:
            Created GenerationTask
        """
        input_data = None
        if template_config:
            input_data = json.dumps({"template_config": template_config})

        task = await self.db.generationtask.create(
            data={
                "projectId": project_id,
                "sessionId": session_id,
                "taskType": task_type,
                "status": "pending",
                "progress": 0,
                "inputData": input_data,
            }
        )
        return task

    async def get_generation_task(self, task_id: str):
        """
        Get a generation task by ID

        Args:
            task_id: Task ID

        Returns:
            GenerationTask or None if not found
        """
        return await self.db.generationtask.find_unique(where={"id": task_id})

    async def get_latest_generation_task_by_project(
        self, project_id: str, completed_only: bool = False
    ):
        """Get latest generation task for project."""
        where: dict = {"projectId": project_id}
        if completed_only:
            where["status"] = "completed"

        tasks = await self.db.generationtask.find_many(
            where=where,
            take=1,
            order={"updatedAt": "desc"},
        )
        return tasks[0] if tasks else None

    async def update_generation_task_status(
        self,
        task_id: str,
        status: str,
        progress: Optional[int] = None,
        output_urls: Optional[str] = None,
        error_message: Optional[str] = None,
    ):
        """
        Update generation task status

        Args:
            task_id: Task ID
            status: New status (pending/processing/completed/failed)
            progress: Progress percentage (0-100)
            output_urls: JSON string of output URLs
            error_message: Error message if failed

        Returns:
            Updated GenerationTask
        """
        update_data = {"status": status}

        if progress is not None:
            update_data["progress"] = progress

        if output_urls is not None:
            update_data["outputUrls"] = output_urls

        if error_message is not None:
            update_data["errorMessage"] = error_message

        task = await self.db.generationtask.update(
            where={"id": task_id},
            data=update_data,
        )
        return task

    async def update_generation_task_rq_job_id(
        self,
        task_id: str,
        rq_job_id: str,
    ):
        """
        Update task's RQ Job ID

        Args:
            task_id: Task ID
            rq_job_id: RQ Job ID

        Returns:
            Updated GenerationTask
        """
        return await self.db.generationtask.update(
            where={"id": task_id},
            data={"rqJobId": rq_job_id},
        )

    async def get_generation_task_by_rq_job_id(
        self,
        rq_job_id: str,
    ):
        """
        Get task by RQ Job ID

        Args:
            rq_job_id: RQ Job ID

        Returns:
            GenerationTask or None if not found
        """
        return await self.db.generationtask.find_first(where={"rqJobId": rq_job_id})

    async def increment_task_retry_count(
        self,
        task_id: str,
    ):
        """
        Increment task retry count

        Args:
            task_id: Task ID

        Returns:
            Updated GenerationTask
        """
        task = await self.get_generation_task(task_id)
        if task:
            return await self.db.generationtask.update(
                where={"id": task_id},
                data={"retryCount": {"increment": 1}},
            )
        return None


# Global database service instance
db_service = DatabaseService()
