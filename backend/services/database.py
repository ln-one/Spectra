import json
from typing import Optional

from prisma import Prisma
from schemas.projects import ProjectCreate
from utils.exceptions import APIException, NotFoundException, ValidationException


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

    async def create_project(self, project_data: ProjectCreate, user_id: str):
        """
        Create a new project

        Args:
            project_data: Project creation data
            user_id: User ID who owns the project
        """
        data = {
            "name": project_data.name,
            "description": project_data.description,
            "userId": user_id,
        }
        if getattr(project_data, "grade_level", None) is not None:
            data["gradeLevel"] = project_data.grade_level

        # Project Space 扩展字段
        if getattr(project_data, "visibility", None) is not None:
            data["visibility"] = project_data.visibility
        if getattr(project_data, "is_referenceable", None) is not None:
            data["isReferenceable"] = project_data.is_referenceable

        project = await self.db.project.create(data=data)

        # 如果指定了 base_project_id，自动创建 base reference（带回滚保护）
        base_project_id = getattr(project_data, "base_project_id", None)
        if base_project_id:
            try:
                # 验证 base project 存在
                base_project = await self.get_project(base_project_id)
                if not base_project:
                    raise NotFoundException(
                        message=f"基底项目不存在: {base_project_id}"
                    )

                reference_mode = getattr(project_data, "reference_mode", "follow")
                if reference_mode not in {"follow", "pinned"}:
                    raise ValidationException(
                        message="reference_mode 仅支持 follow 或 pinned"
                    )

                pinned_version_id = None
                if reference_mode == "pinned":
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
                    relation_type="base",
                    mode=reference_mode,
                    pinned_version_id=pinned_version_id,
                    priority=0,
                    created_by=user_id,
                )
            except APIException:
                # 回滚：删除刚创建的 project
                await self.delete_project(project.id)
                raise
            except Exception as e:
                # 回滚：删除刚创建的 project
                await self.delete_project(project.id)
                raise ValidationException(message=f"创建基底引用失败: {e}")

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
        visibility: Optional[str] = None,
        is_referenceable: Optional[bool] = None,
    ):
        """Update project name/description/grade_level/visibility/is_referenceable."""
        data: dict = {"name": name, "description": description}
        if grade_level is not None:
            data["gradeLevel"] = grade_level
        if visibility is not None:
            data["visibility"] = visibility
        if is_referenceable is not None:
            data["isReferenceable"] = is_referenceable
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

    # ============================================
    # Project Space Methods
    # ============================================

    # ProjectReference Methods
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
        """Create a new project reference."""
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
        """Get all references for a project."""
        return await self.db.projectreference.find_many(
            where={"projectId": project_id, "status": "active"},
            order={"priority": "asc"},
        )

    async def get_project_reference(self, reference_id: str):
        """Get a specific project reference by ID."""
        return await self.db.projectreference.find_unique(where={"id": reference_id})

    async def update_project_reference(
        self,
        reference_id: str,
        mode: Optional[str] = None,
        pinned_version_id: Optional[str] = None,
        priority: Optional[int] = None,
        status: Optional[str] = None,
    ):
        """Update a project reference."""
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
            where={"id": reference_id},
            data=data,
        )

    async def delete_project_reference(self, reference_id: str):
        """Soft delete a project reference by setting status to disabled."""
        return await self.db.projectreference.update(
            where={"id": reference_id},
            data={"status": "disabled"},
        )

    async def get_base_reference(self, project_id: str):
        """Get the base reference for a project."""
        return await self.db.projectreference.find_first(
            where={
                "projectId": project_id,
                "relationType": "base",
                "status": "active",
            }
        )

    # ProjectVersion Methods
    async def get_project_versions(self, project_id: str):
        """Get all versions for a project, ordered by creation time desc."""
        return await self.db.projectversion.find_many(
            where={"projectId": project_id},
            order={"createdAt": "desc"},
        )

    async def get_project_version(self, version_id: str):
        """Get a specific project version by ID."""
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
        """Create a new project version."""
        data = {
            "projectId": project_id,
            "changeType": change_type,
        }
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
        """Update project's current version ID."""
        return await self.db.project.update(
            where={"id": project_id},
            data={"currentVersionId": version_id},
        )

    # Artifact Methods
    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
    ):
        """Get artifacts for a project with optional filters."""
        where: dict = {"projectId": project_id}
        if type_filter:
            where["type"] = type_filter
        if visibility_filter:
            where["visibility"] = visibility_filter
        if owner_user_id_filter:
            where["ownerUserId"] = owner_user_id_filter
        if based_on_version_id_filter:
            where["basedOnVersionId"] = based_on_version_id_filter

        return await self.db.artifact.find_many(
            where=where,
            order={"createdAt": "desc"},
        )

    async def get_artifact(self, artifact_id: str):
        """Get a specific artifact by ID."""
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
        """Create a new artifact."""
        data = {
            "projectId": project_id,
            "type": artifact_type,
            "visibility": visibility,
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

    # CandidateChange Methods
    async def get_candidate_changes(
        self,
        project_id: str,
        status: Optional[str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        """Get candidate changes for a project with optional filters."""
        where: dict = {"projectId": project_id}
        if status:
            where["status"] = status
        if proposer_user_id:
            where["proposerUserId"] = proposer_user_id
        if session_id:
            where["sessionId"] = session_id

        return await self.db.candidatechange.find_many(
            where=where,
            order={"createdAt": "desc"},
        )

    async def get_candidate_change(self, change_id: str):
        """Get a specific candidate change by ID."""
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
        """Create a new candidate change."""
        data = {
            "projectId": project_id,
            "title": title,
        }
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
        status: str,
        review_comment: Optional[str] = None,
        payload: Optional[dict] = None,
    ):
        """Update candidate change status."""
        data = {"status": status}
        if review_comment is not None:
            data["reviewComment"] = review_comment
        if payload is not None:
            data["payload"] = json.dumps(payload)

        return await self.db.candidatechange.update(
            where={"id": change_id},
            data=data,
        )

    # ProjectMember Methods
    async def get_project_members(self, project_id: str):
        """Get all members for a project."""
        return await self.db.projectmember.find_many(
            where={"projectId": project_id, "status": "active"},
            order={"createdAt": "asc"},
        )

    async def get_project_member(self, member_id: str):
        """Get a specific project member by ID."""
        return await self.db.projectmember.find_unique(where={"id": member_id})

    async def get_project_member_by_user(self, project_id: str, user_id: str):
        """Get a project member by project and user ID."""
        return await self.db.projectmember.find_first(
            where={
                "projectId": project_id,
                "userId": user_id,
                "status": "active",
            }
        )

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        role: str,
        permissions: Optional[dict],
    ):
        """Create a new project member."""
        data = {
            "projectId": project_id,
            "userId": user_id,
            "role": role,
        }
        if permissions:
            data["permissions"] = json.dumps(permissions)

        return await self.db.projectmember.create(data=data)

    async def update_project_member(
        self,
        member_id: str,
        role: Optional[str] = None,
        permissions: Optional[dict] = None,
        status: Optional[str] = None,
    ):
        """Update a project member."""
        data = {}
        if role is not None:
            data["role"] = role
        if permissions is not None:
            data["permissions"] = json.dumps(permissions)
        if status is not None:
            data["status"] = status

        return await self.db.projectmember.update(
            where={"id": member_id},
            data=data,
        )

    async def delete_project_member(self, member_id: str):
        """Delete project member."""
        return await self.db.projectmember.delete(where={"id": member_id})


# Global database service instance
db_service = DatabaseService()
