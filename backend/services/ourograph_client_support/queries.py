"""Query-side methods for the remote Ourograph client."""

from __future__ import annotations

from typing import Optional

from .transport import namespace, request_json


class OurographQueryClientMixin:
    async def check_project_permission(self, **kwargs):
        response = await request_json(
            "POST",
            "/queries/check-project-permission",
            payload=kwargs,
        )
        return bool(response.get("allowed"))

    async def check_project_exists(self, *, project_id: str):
        response = await request_json("GET", f"/projects/{project_id}/exists")
        return bool(response.get("exists"))

    async def get_project_references(self, *, project_id: str, user_id: str):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/references",
            query={"user_id": user_id},
        )
        return namespace(response["references"])

    async def get_candidate_changes(self, **kwargs):
        response = await request_json(
            "GET",
            f"/projects/{kwargs['project_id']}/candidate-changes",
            query={
                "user_id": kwargs["user_id"],
                "status": kwargs.get("status"),
                "proposer_user_id": kwargs.get("proposer_user_id"),
                "session_id": kwargs.get("session_id"),
            },
        )
        return namespace(response["changes"])

    async def get_project_members(self, *, project_id: str, user_id: str):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/members",
            query={"user_id": user_id},
        )
        return namespace(response["members"])

    async def resolve_effective_project_context(self, project_id: str, user_id: str):
        return await request_json(
            "POST",
            "/queries/resolve-effective-project-context",
            payload={"project_id": project_id, "user_id": user_id},
        )

    async def get_project_state(self, project_id: str, user_id: str):
        return await request_json(
            "GET",
            f"/projects/{project_id}/state",
            query={"user_id": user_id},
        )

    async def get_project_versions_with_context(self, project_id: str, user_id: str):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/versions",
            query={"user_id": user_id},
        )
        return namespace(response["versions"]), response.get("currentVersionId")

    async def get_project_version_with_context(
        self,
        project_id: str,
        version_id: str,
        user_id: str,
    ):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/versions/{version_id}",
            query={"user_id": user_id},
        )
        return namespace(response["version"]), response.get("currentVersionId")

    async def get_project_artifacts(
        self,
        project_id: str,
        user_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
        session_id_filter: Optional[str] = None,
    ):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/artifacts",
            query={
                "user_id": user_id,
                "type": type_filter,
                "visibility": visibility_filter,
                "owner_user_id": owner_user_id_filter,
                "based_on_version_id": based_on_version_id_filter,
                "session_id": session_id_filter,
            },
        )
        return namespace(response["artifacts"])

    async def get_artifact(self, artifact_id: str, user_id: Optional[str] = None):
        response = await request_json(
            "GET",
            f"/artifacts/{artifact_id}",
            query={"user_id": user_id} if user_id else None,
        )
        artifact = response.get("artifact")
        return namespace(artifact) if artifact is not None else None

    async def get_project_current_version_id(self, project_id: str, user_id: str):
        response = await request_json(
            "GET",
            f"/projects/{project_id}/versions",
            query={"user_id": user_id},
        )
        return response.get("currentVersionId")

    async def get_idempotency_response(self, key: str):
        response = await request_json("GET", f"/idempotency/{key}")
        value = response.get("response")
        return namespace(value) if isinstance(value, dict) else value
