"""Command-side methods for the remote Ourograph client."""

from __future__ import annotations

from .transport import namespace, request_json


class OurographCommandClientMixin:
    async def create_managed_project(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/create-managed-project",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "name": kwargs["name"],
                    "description": kwargs.get("description"),
                    "visibility": kwargs["visibility"],
                    "is_referenceable": kwargs["is_referenceable"],
                },
            },
        )
        return namespace(response["project"])

    async def delete_project(self, **kwargs):
        await request_json(
            "POST",
            "/commands/delete-project",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
            },
        )
        return None

    async def update_project_governance(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/update-project-governance",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "description": kwargs.get("description"),
                    "visibility": kwargs.get("visibility"),
                    "is_referenceable": kwargs.get("is_referenceable"),
                },
            },
        )
        return namespace(response["project"])

    async def create_project_reference(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/create-project-reference",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "target_project_id": kwargs["target_project_id"],
                    "relation_type": kwargs["relation_type"],
                    "mode": kwargs["mode"],
                    "pinned_version_id": kwargs.get("pinned_version_id"),
                    "priority": kwargs.get("priority", 0),
                },
            },
        )
        return namespace(response["reference"])

    async def update_project_reference(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/update-project-reference",
            payload={
                "project_id": kwargs["project_id"],
                "reference_id": kwargs["reference_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "mode": kwargs.get("mode"),
                    "pinned_version_id": kwargs.get("pinned_version_id"),
                    "priority": kwargs.get("priority"),
                    "status": kwargs.get("status"),
                },
            },
        )
        return namespace(response["reference"])

    async def delete_project_reference(self, **kwargs):
        await request_json(
            "POST",
            "/commands/delete-project-reference",
            payload=kwargs,
        )
        return None

    async def create_candidate_change(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/create-candidate-change",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "title": kwargs["title"],
                    "summary": kwargs.get("summary"),
                    "payload": kwargs.get("payload"),
                    "session_id": kwargs.get("session_id"),
                    "trigger": kwargs.get("trigger"),
                    "base_version_id": kwargs.get("base_version_id"),
                },
            },
        )
        return namespace(response["change"])

    async def review_candidate_change(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/review-candidate-change",
            payload=kwargs,
        )
        return namespace(response["change"])

    async def create_project_member(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/create-project-member",
            payload={
                "project_id": kwargs["project_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "user_id": kwargs["target_user_id"],
                    "role": kwargs["role"],
                    "permissions": kwargs.get("permissions"),
                },
            },
        )
        return namespace(response["member"])

    async def update_project_member(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/update-project-member",
            payload={
                "project_id": kwargs["project_id"],
                "member_id": kwargs["member_id"],
                "user_id": kwargs["user_id"],
                "body": {
                    "role": kwargs.get("role"),
                    "permissions": kwargs.get("permissions"),
                    "status": kwargs.get("status"),
                },
            },
        )
        return namespace(response["member"])

    async def delete_project_member(self, **kwargs):
        await request_json("POST", "/commands/delete-project-member", payload=kwargs)
        return None

    async def create_artifact_with_file(self, **kwargs):
        raise RuntimeError(
            "create_artifact_with_file must be orchestrated in Spectra, "
            "not delegated to remote Ourograph"
        )

    async def create_artifact(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/create-artifact",
            payload=kwargs,
        )
        return namespace(response["artifact"])

    async def bind_artifact_to_version(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/bind-artifact-to-version",
            payload=kwargs,
        )
        return namespace(response["artifact"])

    async def commit_project_version(self, **kwargs):
        response = await request_json(
            "POST",
            "/commands/commit-project-version",
            payload=kwargs,
        )
        return namespace(response["version"])

    async def update_artifact_metadata(self, *, artifact_id: str, metadata: dict):
        response = await request_json(
            "POST",
            "/commands/update-artifact-metadata",
            payload={"artifact_id": artifact_id, "metadata": metadata},
        )
        return namespace(response["artifact"])

    async def save_idempotency_response(self, key: str, response: dict):
        await request_json(
            "POST",
            f"/idempotency/{key}",
            payload={"response": response},
        )
        return None
