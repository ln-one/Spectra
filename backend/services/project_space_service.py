"""
Project Space Service

Business logic for project space features:
- Permission checking
- Artifact storage path generation
- Artifact creation with file generation
- Version management helpers
- DAG cycle detection
- Reference validation
- Candidate change review
"""

import html
import logging
from typing import Any, Dict, Optional, Set

from services.artifact_generator import artifact_generator
from services.database import db_service
from utils.exceptions import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)

logger = logging.getLogger(__name__)


class ProjectSpaceService:
    """
    Project space business logic service.

    Handles:
    - Permission checking for project resources
    - Artifact storage path generation
    - Version creation helpers
    """

    def __init__(self):
        self.db = db_service
        logger.info("ProjectSpaceService initialized")

    async def check_project_permission(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        """
        Check if user has specific permission on project.

        Args:
            project_id: Project ID
            user_id: User ID
            permission: Permission to check
                (can_view/can_reference/can_collaborate/can_manage)

        Returns:
            True if user has permission

        Raises:
            NotFoundException: Project not found
            ForbiddenException: User doesn't have permission
        """
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")

        if project.userId == user_id:
            return True

        member = await self.db.get_project_member_by_user(project_id, user_id)
        if member:
            permissions = member.permissions
            if isinstance(permissions, str):
                import json

                try:
                    permissions = json.loads(permissions) if permissions else {}
                except json.JSONDecodeError:
                    permissions = {}
            if isinstance(permissions, dict) and permissions.get(permission, False):
                return True

        raise ForbiddenException(
            f"User {user_id} doesn't have {permission} permission "
            f"on project {project_id}"
        )

    async def check_project_exists(self, project_id: str) -> bool:
        """
        Check if project exists.

        Args:
            project_id: Project ID

        Returns:
            True if project exists

        Raises:
            NotFoundException: Project not found
        """
        project = await self.db.get_project(project_id)
        if not project:
            raise NotFoundException(f"Project {project_id} not found")
        return True

    async def get_artifact_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        """
        Generate storage path for artifact.

        Args:
            project_id: Project ID
            artifact_type: Artifact type
            artifact_id: Artifact ID

        Returns:
            Storage path
        """
        return artifact_generator.get_storage_path(
            project_id, artifact_type, artifact_id
        )

    async def create_artifact_with_file(
        self,
        project_id: str,
        artifact_type: str,
        visibility: str,
        user_id: str,
        session_id: Optional[str] = None,
        based_on_version_id: Optional[str] = None,
        content: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Create artifact with actual file generation.

        Args:
            project_id: Project ID
            artifact_type: Artifact type
            visibility: Visibility setting
            user_id: Owner user ID
            session_id: Optional session ID
            based_on_version_id: Optional version ID
            content: Content for file generation

        Returns:
            Created artifact record
        """
        import uuid

        artifact_type = (
            artifact_type.value
            if hasattr(artifact_type, "value")
            else str(artifact_type)
        )
        artifact_id = str(uuid.uuid4())
        storage_path = artifact_generator.get_storage_path(
            project_id, artifact_type, artifact_id
        )

        if based_on_version_id:
            version = await self.db.get_project_version(based_on_version_id)
            if not version or version.projectId != project_id:
                raise ValidationException(
                    "based_on_version_id "
                    f"{based_on_version_id} is invalid for project {project_id}"
                )

        # Generate actual file based on type.
        normalized_content = self._normalize_artifact_content(
            artifact_type, content or {}
        )

        # Check if type is supported for file generation
        supported_types = [
            "pptx",
            "docx",
            "mindmap",
            "summary",
            "exercise",
            "html",
            "gif",
            "mp4",
        ]
        if artifact_type not in supported_types:
            raise ValidationException(
                f"Artifact type '{artifact_type}' file generation not yet supported. "
                f"Supported types: {', '.join(supported_types)}"
            )

        try:
            if artifact_type == "pptx":
                actual_path = await artifact_generator.generate_pptx(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "docx":
                actual_path = await artifact_generator.generate_docx(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "mindmap":
                actual_path = await artifact_generator.generate_mindmap(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "summary":
                actual_path = await artifact_generator.generate_summary(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "exercise":
                actual_path = await artifact_generator.generate_quiz(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "html":
                html_content = normalized_content.get(
                    "html", "<html><body>Empty</body></html>"
                )
                actual_path = await artifact_generator.generate_html(
                    html_content, project_id, artifact_id
                )
            elif artifact_type == "gif":
                actual_path = await artifact_generator.generate_animation(
                    normalized_content, project_id, artifact_id
                )
            elif artifact_type == "mp4":
                actual_path = await artifact_generator.generate_video_placeholder(
                    project_id, artifact_id
                )

            # Use actual generated path
            storage_path = actual_path
        except Exception as e:
            logger.error(f"Failed to generate artifact file: {e}")
            raise

        # Create artifact record in database
        artifact = await self.db.create_artifact(
            project_id=project_id,
            artifact_type=artifact_type,
            visibility=visibility,
            session_id=session_id,
            based_on_version_id=based_on_version_id,
            owner_user_id=user_id,
            storage_path=storage_path,
            metadata=self._build_artifact_metadata(
                artifact_type, normalized_content, user_id
            ),
        )
        return artifact

    @staticmethod
    def _build_animation_storyboard_html(content: Dict[str, Any]) -> str:
        title = html.escape(content.get("title", "Animation Storyboard"))
        scenes = content.get("scenes") or [
            {
                "title": "Scene 1",
                "description": "Pending storyboard scene.",
                "visuals": "Add key visual cues.",
                "narration": "Add narration notes.",
            }
        ]

        scene_markup = []
        for index, scene in enumerate(scenes, start=1):
            scene_title = html.escape(scene.get("title") or f"Scene {index}")
            description = html.escape(
                scene.get("description") or "Pending storyboard details."
            )
            visuals = html.escape(scene.get("visuals") or "TBD")
            narration = html.escape(scene.get("narration") or "TBD")
            scene_markup.append(f"""
                <section class="scene-card">
                  <h2>{scene_title}</h2>
                  <p>{description}</p>
                  <dl>
                    <dt>Visuals</dt>
                    <dd>{visuals}</dd>
                    <dt>Narration</dt>
                    <dd>{narration}</dd>
                  </dl>
                </section>
                """.strip())

        body = "\n".join(scene_markup)
        return (
            "<!DOCTYPE html>\n"
            '<html lang="en">\n'
            "<head>\n"
            '  <meta charset="utf-8" />\n'
            f"  <title>{title}</title>\n"
            "  <style>\n"
            "    body { font-family: Arial, sans-serif; margin: 40px; }\n"
            "    .scene-card { border: 1px solid #d0d7de; padding: 16px; "
            "margin-bottom: 16px; border-radius: 12px; }\n"
            "    dt { font-weight: 700; margin-top: 8px; }\n"
            "    dd { margin: 0; color: #444; }\n"
            "  </style>\n"
            "</head>\n"
            "<body>\n"
            f"  <h1>{title}</h1>\n"
            f"  {body}\n"
            "</body>\n"
            "</html>\n"
        )

    @classmethod
    def _normalize_artifact_content(
        cls, artifact_type: str, content: Dict[str, Any]
    ) -> Dict[str, Any]:
        mode = str(content.get("mode") or "").strip().lower()
        if artifact_type == "pptx":
            return {"title": "PPT demo", "slides": [], **content}
        if artifact_type == "docx":
            normalized = {"title": "Teaching handout", "sections": [], **content}
            if mode == "handout":
                normalized["kind"] = "handout"
                normalized.setdefault("title", "Teaching handout")
            return normalized
        if artifact_type == "mindmap":
            return {"title": "Mindmap", "nodes": [], **content}
        if artifact_type == "summary":
            normalized = {
                "title": "Course summary",
                "summary": "",
                "key_points": [],
                **content,
            }
            if mode == "outline":
                normalized["kind"] = "outline"
                normalized.setdefault("title", "Course outline")
                normalized.setdefault("nodes", [])
            return normalized
        if artifact_type == "exercise":
            return {"title": "Exercise", "questions": [], **content}
        if artifact_type == "html":
            normalized = dict(content)
            if mode == "animation_storyboard":
                normalized.setdefault("title", "Animation Storyboard")
                normalized["kind"] = "animation_storyboard"
                normalized["html"] = cls._build_animation_storyboard_html(normalized)
                return normalized
            normalized.setdefault("html", "<html><body>Empty</body></html>")
            return normalized
        if artifact_type == "gif":
            return {"title": "Animation placeholder", "scenes": [], **content}
        if artifact_type == "mp4":
            return {"title": "Video placeholder", **content}
        return {"title": f"{artifact_type} artifact", "data": [], **content}

    @staticmethod
    def _build_artifact_metadata(
        artifact_type: str, content: Dict[str, Any], user_id: str
    ) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {"created_by": user_id}
        if artifact_type == "mindmap":
            metadata["capability"] = "mindmap"
        if artifact_type == "exercise":
            metadata["capability"] = "quiz"
        if artifact_type == "summary" and content.get("kind") == "outline":
            metadata["kind"] = "outline"
            metadata["capability"] = "outline"
        if artifact_type == "docx" and content.get("kind") == "handout":
            metadata["kind"] = "handout"
            metadata["capability"] = "handout"
        if artifact_type == "html" and content.get("kind") == "animation_storyboard":
            metadata["kind"] = "animation_storyboard"
            metadata["capability"] = "animation"
        return metadata

    @staticmethod
    def _default_artifact_content(artifact_type: str) -> Dict[str, Any]:
        # Backward-compatible helper kept for callers/tests that still use it directly.
        if artifact_type == "pptx":
            return {"title": "PPT demo", "slides": []}
        if artifact_type == "docx":
            return {"title": "Teaching handout", "sections": []}
        if artifact_type == "mindmap":
            return {"title": "Mindmap", "nodes": []}
        if artifact_type == "summary":
            return {"title": "Course summary", "summary": "", "key_points": []}
        if artifact_type == "exercise":
            return {"title": "Exercise", "questions": []}
        if artifact_type == "html":
            return {"html": "<html><body>Empty</body></html>"}
        if artifact_type == "gif":
            return {"title": "Animation placeholder", "scenes": []}
        if artifact_type == "mp4":
            return {"title": "Video placeholder"}
        return {"title": f"{artifact_type} artifact", "data": []}

    async def get_project_versions(self, project_id: str):
        """Get project versions."""
        return await self.db.get_project_versions(project_id)

    async def get_project_version(self, version_id: str):
        """Get specific project version."""
        return await self.db.get_project_version(version_id)

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
    ):
        """Get project artifacts with filters."""
        return await self.db.get_project_artifacts(
            project_id,
            type_filter,
            visibility_filter,
            owner_user_id_filter,
            based_on_version_id_filter,
        )

    async def get_artifact(self, artifact_id: str):
        """Get specific artifact."""
        return await self.db.get_artifact(artifact_id)

    async def create_project_reference(
        self,
        project_id: str,
        user_id: str,
        target_project_id: str,
        relation_type: str,
        mode: str,
        pinned_version_id: Optional[str] = None,
        priority: int = 0,
    ):
        """Create project reference with permission and contract validations."""
        await self.check_project_permission(project_id, user_id, "can_manage")
        await self.validate_reference_creation(
            project_id=project_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
        )
        return await self.db.create_project_reference(
            project_id=project_id,
            target_project_id=target_project_id,
            relation_type=relation_type,
            mode=mode,
            pinned_version_id=pinned_version_id,
            priority=priority,
            created_by=user_id,
        )

    async def get_project_references(self, project_id: str, user_id: str):
        """List project references."""
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_project_references(project_id)

    async def update_project_reference(
        self,
        project_id: str,
        reference_id: str,
        user_id: str,
        mode: Optional[str] = None,
        pinned_version_id: Optional[str] = None,
        priority: Optional[int] = None,
        status: Optional[str] = None,
    ):
        """Update reference after ownership and payload validation."""
        await self.check_project_permission(project_id, user_id, "can_manage")

        reference = await self.db.get_project_reference(reference_id)
        if not reference or reference.projectId != project_id:
            raise NotFoundException(
                f"Reference {reference_id} not found in project {project_id}"
            )

        if mode == "pinned" and not pinned_version_id:
            raise ValidationException("mode=pinned requires pinned_version_id")

        if pinned_version_id:
            version = await self.db.get_project_version(pinned_version_id)
            if not version or version.projectId != reference.targetProjectId:
                raise ValidationException(
                    f"pinned_version_id {pinned_version_id} does not belong to "
                    f"target project {reference.targetProjectId}"
                )

        return await self.db.update_project_reference(
            reference_id=reference_id,
            mode=mode,
            pinned_version_id=pinned_version_id,
            priority=priority,
            status=status,
        )

    async def delete_project_reference(
        self,
        project_id: str,
        reference_id: str,
        user_id: str,
    ):
        """Soft-delete project reference."""
        await self.check_project_permission(project_id, user_id, "can_manage")
        reference = await self.db.get_project_reference(reference_id)
        if not reference or reference.projectId != project_id:
            raise NotFoundException(
                f"Reference {reference_id} not found in project {project_id}"
            )
        return await self.db.delete_project_reference(reference_id)

    async def create_candidate_change(
        self,
        project_id: str,
        user_id: str,
        title: str,
        summary: Optional[str] = None,
        payload: Optional[dict] = None,
        session_id: Optional[str] = None,
        base_version_id: Optional[str] = None,
    ):
        """Create candidate change with permission and base-version validation."""
        await self.check_project_permission(project_id, user_id, "can_collaborate")
        if base_version_id:
            base_version = await self.db.get_project_version(base_version_id)
            if not base_version or base_version.projectId != project_id:
                raise ValidationException(
                    "base_version_id "
                    f"{base_version_id} does not belong to project {project_id}"
                )
        return await self.db.create_candidate_change(
            project_id=project_id,
            title=title,
            summary=summary,
            payload=payload,
            session_id=session_id,
            base_version_id=base_version_id,
            proposer_user_id=user_id,
        )

    async def get_candidate_changes(
        self,
        project_id: str,
        user_id: str,
        status: Optional[str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        """List candidate changes by project with optional filters."""
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_candidate_changes(
            project_id=project_id,
            status=status,
            proposer_user_id=proposer_user_id,
            session_id=session_id,
        )

    async def get_project_members(self, project_id: str, user_id: str):
        """List project members."""
        await self.check_project_permission(project_id, user_id, "can_view")
        return await self.db.get_project_members(project_id)

    async def create_project_member(
        self,
        project_id: str,
        user_id: str,
        target_user_id: str,
        role: str,
        permissions: Optional[dict] = None,
    ):
        """Create project member with duplicate-guard."""
        await self.check_project_permission(project_id, user_id, "can_manage")
        existing = await self.db.get_project_member_by_user(project_id, target_user_id)
        if existing:
            raise ConflictException(
                "User "
                f"{target_user_id} is already an active member of project {project_id}"
            )
        return await self.db.create_project_member(
            project_id=project_id,
            user_id=target_user_id,
            role=role,
            permissions=permissions,
        )

    async def update_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
        role: Optional[str] = None,
        permissions: Optional[dict] = None,
        status: Optional[str] = None,
    ):
        """Update project member after project-boundary validation."""
        await self.check_project_permission(project_id, user_id, "can_manage")
        member = await self.db.get_project_member(member_id)
        if not member or member.projectId != project_id:
            raise NotFoundException(
                f"Member {member_id} not found in project {project_id}"
            )
        return await self.db.update_project_member(
            member_id=member_id,
            role=role,
            permissions=permissions,
            status=status,
        )

    async def delete_project_member(
        self,
        project_id: str,
        member_id: str,
        user_id: str,
    ):
        """Delete project member after validation."""
        await self.check_project_permission(project_id, user_id, "can_manage")
        member = await self.db.get_project_member(member_id)
        if not member or member.projectId != project_id:
            raise NotFoundException(
                f"Member {member_id} not found in project {project_id}"
            )

        # Prevent deleting project owner
        project = await self.db.get_project(project_id)
        if member.userId == project.userId:
            raise ValidationException("Cannot delete project owner")

        return await self.db.delete_project_member(member_id)

    async def get_idempotency_response(self, key: str):
        """Proxy idempotency read for router-level response caching."""
        return await self.db.get_idempotency_response(key)

    async def save_idempotency_response(self, key: str, response: dict):
        """Proxy idempotency write for router-level response caching."""
        return await self.db.save_idempotency_response(key, response)

    # ============================================
    # Reference Management & DAG Validation
    # ============================================

    async def check_dag_cycle(self, project_id: str, new_target_id: str) -> bool:
        """
        Check if adding a reference would create a cycle in the DAG.

        Uses DFS to detect cycles. Returns True if cycle would be created.

        Args:
            project_id: Source project ID
            new_target_id: Target project ID to add

        Returns:
            True if cycle detected, False otherwise
        """
        # Build adjacency list of all references
        visited: Set[str] = set()
        rec_stack: Set[str] = set()

        async def has_cycle_dfs(node_id: str) -> bool:
            """DFS helper to detect cycles."""
            visited.add(node_id)
            rec_stack.add(node_id)

            # Get all references from this node
            refs = await self.db.get_project_references(node_id)
            for ref in refs:
                target = ref.targetProjectId
                if target not in visited:
                    if await has_cycle_dfs(target):
                        return True
                elif target in rec_stack:
                    return True

            rec_stack.remove(node_id)
            return False

        # Simulate adding the new edge
        # Check if new_target_id can reach project_id
        visited.clear()
        rec_stack.clear()

        # Start DFS from new_target_id to see if it can reach project_id
        async def can_reach(current: str, target: str) -> bool:
            if current == target:
                return True
            if current in visited:
                return False
            visited.add(current)

            refs = await self.db.get_project_references(current)
            for ref in refs:
                if await can_reach(ref.targetProjectId, target):
                    return True
            return False

        return await can_reach(new_target_id, project_id)

    async def validate_reference_creation(
        self,
        project_id: str,
        target_project_id: str,
        relation_type: str,
        mode: str,
        pinned_version_id: Optional[str],
    ):
        """
        Validate reference creation rules.

        Rules:
        - Only one base reference allowed
        - mode=pinned requires pinned_version_id
        - Target project must exist and be referenceable
        - No cycles in DAG

        Raises:
            ConflictException: If validation fails
        """
        source_project = await self.db.get_project(project_id)
        if not source_project:
            raise NotFoundException(f"Project not found: {project_id}")

        # Check if target project exists
        target_project = await self.db.get_project(target_project_id)
        if not target_project:
            raise NotFoundException(f"Target project not found: {target_project_id}")

        # Check if target is referenceable
        if not getattr(target_project, "isReferenceable", True):
            raise ValidationException(f"Target not referenceable: {target_project_id}")

        # Default black-box visibility:
        # non-shared projects cannot be referenced across owners.
        target_visibility = getattr(target_project, "visibility", "private")
        source_owner_id = getattr(source_project, "userId", None)
        target_owner_id = getattr(target_project, "userId", None)
        if (
            target_visibility != "shared"
            and source_owner_id
            and target_owner_id
            and source_owner_id != target_owner_id
        ):
            raise ForbiddenException(
                "Target project is private across owners unless visibility is shared."
            )

        # Check base reference uniqueness
        if relation_type == "base":
            existing_base = await self.db.get_base_reference(project_id)
            if existing_base:
                raise ConflictException("Project already has an active base reference.")

        # Check pinned mode requires version
        if mode == "pinned" and not pinned_version_id:
            raise ValidationException("mode=pinned requires pinned_version_id")

        # Validate pinned version exists
        if pinned_version_id:
            version = await self.db.get_project_version(pinned_version_id)
            if not version or version.projectId != target_project_id:
                raise ValidationException(
                    f"Invalid pinned_version_id for target project: {pinned_version_id}"
                )

        # Check for DAG cycles
        if await self.check_dag_cycle(project_id, target_project_id):
            raise ConflictException(
                f"Reference would create DAG cycle: {project_id} -> {target_project_id}"
            )

    # ============================================
    # Candidate Change & Review
    # ============================================

    async def review_candidate_change(
        self,
        project_id: str,
        change_id: str,
        action: str,
        review_comment: Optional[str],
        reviewer_user_id: str,
    ):
        """
        Review a candidate change (accept/reject).

        If accepted, creates a new version and updates current_version_id.

        Args:
            project_id: Project ID
            change_id: Candidate change ID
            action: "accept" or "reject"
            review_comment: Optional review comment
            reviewer_user_id: User performing review

        Returns:
            Updated candidate change record
        """
        # Get candidate change
        change = await self.db.get_candidate_change(change_id)
        if not change:
            raise NotFoundException(f"Candidate change not found: {change_id}")
        if change.projectId != project_id:
            raise NotFoundException(
                f"Candidate change {change_id} not found in project {project_id}"
            )

        if change.status != "pending":
            raise ConflictException(f"Status conflict: {change.status}")

        # Update status
        if action == "accept":
            project = await self.db.get_project(change.projectId)
            if not project:
                raise NotFoundException(f"Project not found: {change.projectId}")

            current_version_id = getattr(project, "currentVersionId", None)
            base_version_id = getattr(change, "baseVersionId", None)
            if base_version_id != current_version_id:
                raise ConflictException(
                    "Base version conflicts with current project version."
                )

            # Create new version
            payload = change.payload
            if isinstance(payload, str):
                import json

                try:
                    payload = json.loads(payload) if payload else {}
                except json.JSONDecodeError:
                    logger.warning(
                        "Invalid candidate change payload JSON for change %s, "
                        "fallback to empty dict",
                        change_id,
                    )
                    payload = {}
            if not isinstance(payload, dict):
                payload = {}

            new_version = await self.db.create_project_version(
                project_id=change.projectId,
                parent_version_id=change.baseVersionId,
                summary=change.summary or change.title,
                change_type="merge-change",
                snapshot_data=payload,
                created_by=reviewer_user_id,
            )

            # Update project current version
            await self.db.update_project_current_version(
                change.projectId, new_version.id
            )

            # Update change status
            payload_with_review = dict(payload)
            payload_with_review["review"] = {
                "action": "accept",
                "accepted_version_id": new_version.id,
                "reviewer_user_id": reviewer_user_id,
            }
            updated_change = await self.db.update_candidate_change_status(
                change_id,
                "accepted",
                review_comment,
                payload=payload_with_review,
            )
            logger.info(
                f"Accepted candidate change {change_id}, "
                f"created version {new_version.id}"
            )
            return updated_change

        elif action == "reject":
            updated_change = await self.db.update_candidate_change_status(
                change_id, "rejected", review_comment
            )
            logger.info(f"Rejected candidate change {change_id}")
            return updated_change

        else:
            raise ValidationException(
                f"Invalid action: {action}. Only accept/reject are supported."
            )

    # ============================================
    # Member Permission Management
    # ============================================

    async def check_project_permission_with_member(
        self, project_id: str, user_id: str, permission: str = "can_view"
    ) -> bool:
        """Backward-compatible alias of check_project_permission."""
        return await self.check_project_permission(project_id, user_id, permission)


# Global project space service instance
project_space_service = ProjectSpaceService()
