"""HTTP client for the Ourograph service."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from types import SimpleNamespace
from typing import Any, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from utils.exceptions import (
    ConflictException,
    ExternalServiceException,
    ForbiddenException,
    InternalServerException,
    NotFoundException,
    ValidationException,
)

logger = logging.getLogger(__name__)


def ourograph_base_url() -> str:
    return os.getenv("OUROGRAPH_BASE_URL", "").strip().rstrip("/")


def ourograph_enabled() -> bool:
    return bool(ourograph_base_url())


def _timeout_seconds() -> float:
    raw = os.getenv("OUROGRAPH_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return 30.0
    try:
        return max(1.0, float(raw))
    except ValueError:
        return 30.0


def _namespace(value: Any) -> Any:
    if isinstance(value, dict):
        return SimpleNamespace(**{key: _namespace(item) for key, item in value.items()})
    if isinstance(value, list):
        return [_namespace(item) for item in value]
    return value


def _raise_service_error(status_code: int, payload: dict[str, Any] | None):
    message = (
        (payload or {}).get("message")
        or (payload or {}).get("detail", {}).get("message")
        or f"ourograph_request_failed status={status_code}"
    )
    error_code = (payload or {}).get("error_code")
    if status_code == 400:
        raise ValidationException(message=message)
    if status_code == 403:
        raise ForbiddenException(message=message)
    if status_code == 404:
        raise NotFoundException(message=message)
    if status_code == 409:
        raise ConflictException(message=message)
    raise InternalServerException(
        message=message,
        details={"error_code": error_code, "status_code": status_code},
    )


async def _request(
    method: str,
    endpoint: str,
    *,
    payload: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_url = ourograph_base_url()
    if not base_url:
        raise RuntimeError("ourograph_base_url_not_configured")
    url = f"{base_url}{endpoint}"
    if query:
        encoded = urllib_parse.urlencode(
            {key: value for key, value in query.items() if value is not None}
        )
        if encoded:
            url = f"{url}?{encoded}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    def _run() -> tuple[int, str]:
        request = urllib_request.Request(
            url,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib_request.urlopen(
                request, timeout=_timeout_seconds()
            ) as response:
                return response.getcode(), response.read().decode("utf-8")
        except urllib_error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", errors="replace")
        except urllib_error.URLError as exc:
            raise ExternalServiceException(
                message="Ourograph service unreachable",
                details={"reason": str(exc.reason)},
                retryable=True,
            ) from exc
        except TimeoutError as exc:
            raise ExternalServiceException(
                message="Ourograph request timeout",
                retryable=True,
            ) from exc

    status_code, body = await asyncio.to_thread(_run)
    try:
        payload_obj = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise InternalServerException(
            message="Ourograph returned invalid JSON",
            details={"status_code": status_code, "body": body[:300]},
        ) from exc
    if status_code >= 400:
        _raise_service_error(
            status_code, payload_obj if isinstance(payload_obj, dict) else None
        )
    if not isinstance(payload_obj, dict):
        raise InternalServerException(message="Invalid Ourograph response payload")
    return payload_obj


class OurographClient:
    async def check_project_permission(self, **kwargs):
        response = await _request(
            "POST",
            "/queries/check-project-permission",
            payload=kwargs,
        )
        return bool(response.get("allowed"))

    async def check_project_exists(self, *, project_id: str):
        response = await _request("GET", f"/projects/{project_id}/exists")
        return bool(response.get("exists"))

    async def create_project_reference(self, **kwargs):
        response = await _request(
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
        return _namespace(response["reference"])

    async def get_project_references(self, *, project_id: str, user_id: str):
        response = await _request(
            "GET",
            f"/projects/{project_id}/references",
            query={"user_id": user_id},
        )
        return _namespace(response["references"])

    async def update_project_reference(self, **kwargs):
        response = await _request(
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
        return _namespace(response["reference"])

    async def delete_project_reference(self, **kwargs):
        await _request(
            "POST",
            "/commands/delete-project-reference",
            payload=kwargs,
        )
        return None

    async def create_candidate_change(self, **kwargs):
        response = await _request(
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
                    "base_version_id": kwargs.get("base_version_id"),
                },
            },
        )
        return _namespace(response["change"])

    async def get_candidate_changes(self, **kwargs):
        response = await _request(
            "GET",
            f"/projects/{kwargs['project_id']}/candidate-changes",
            query={
                "user_id": kwargs["user_id"],
                "status": kwargs.get("status"),
                "proposer_user_id": kwargs.get("proposer_user_id"),
                "session_id": kwargs.get("session_id"),
            },
        )
        return _namespace(response["changes"])

    async def review_candidate_change(self, **kwargs):
        response = await _request(
            "POST",
            "/commands/review-candidate-change",
            payload=kwargs,
        )
        return _namespace(response["change"])

    async def get_project_members(self, *, project_id: str, user_id: str):
        response = await _request(
            "GET",
            f"/projects/{project_id}/members",
            query={"user_id": user_id},
        )
        return _namespace(response["members"])

    async def create_project_member(self, **kwargs):
        response = await _request(
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
        return _namespace(response["member"])

    async def update_project_member(self, **kwargs):
        response = await _request(
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
        return _namespace(response["member"])

    async def delete_project_member(self, **kwargs):
        await _request("POST", "/commands/delete-project-member", payload=kwargs)
        return None

    async def create_artifact_with_file(self, **kwargs):
        raise RuntimeError(
            "create_artifact_with_file must be orchestrated in Spectra, "
            "not delegated to remote Ourograph"
        )

    async def create_artifact(self, **kwargs):
        response = await _request(
            "POST",
            "/commands/create-artifact",
            payload=kwargs,
        )
        return _namespace(response["artifact"])

    async def bind_artifact_to_version(self, **kwargs):
        response = await _request(
            "POST",
            "/commands/bind-artifact-to-version",
            payload=kwargs,
        )
        return _namespace(response["artifact"])

    async def commit_project_version(self, **kwargs):
        response = await _request(
            "POST",
            "/commands/commit-project-version",
            payload=kwargs,
        )
        return _namespace(response["version"])

    async def resolve_effective_project_context(self, project_id: str, user_id: str):
        response = await _request(
            "POST",
            "/queries/resolve-effective-project-context",
            payload={"project_id": project_id, "user_id": user_id},
        )
        return response

    async def get_project_state(self, project_id: str, user_id: str):
        return await _request(
            "GET",
            f"/projects/{project_id}/state",
            query={"user_id": user_id},
        )

    async def get_project_versions_with_context(self, project_id: str):
        response = await _request("GET", f"/projects/{project_id}/versions")
        return _namespace(response["versions"]), response.get("currentVersionId")

    async def get_project_version_with_context(self, project_id: str, version_id: str):
        response = await _request(
            "GET", f"/projects/{project_id}/versions/{version_id}"
        )
        return _namespace(response["version"]), response.get("currentVersionId")

    async def get_project_artifacts(
        self,
        project_id: str,
        type_filter: Optional[str] = None,
        visibility_filter: Optional[str] = None,
        owner_user_id_filter: Optional[str] = None,
        based_on_version_id_filter: Optional[str] = None,
        session_id_filter: Optional[str] = None,
    ):
        response = await _request(
            "GET",
            f"/projects/{project_id}/artifacts",
            query={
                "type": type_filter,
                "visibility": visibility_filter,
                "owner_user_id": owner_user_id_filter,
                "based_on_version_id": based_on_version_id_filter,
                "session_id": session_id_filter,
            },
        )
        return _namespace(response["artifacts"])

    async def get_artifact(self, artifact_id: str):
        response = await _request("GET", f"/artifacts/{artifact_id}")
        artifact = response.get("artifact")
        return _namespace(artifact) if artifact is not None else None

    async def update_artifact_metadata(self, *, artifact_id: str, metadata: dict):
        response = await _request(
            "POST",
            "/commands/update-artifact-metadata",
            payload={"artifact_id": artifact_id, "metadata": metadata},
        )
        return _namespace(response["artifact"])

    async def get_project_current_version_id(self, project_id: str):
        response = await _request("GET", f"/projects/{project_id}/versions")
        return response.get("currentVersionId")

    async def get_idempotency_response(self, key: str):
        response = await _request("GET", f"/idempotency/{key}")
        value = response.get("response")
        return _namespace(value) if isinstance(value, dict) else value

    async def save_idempotency_response(self, key: str, response: dict):
        await _request(
            "POST",
            f"/idempotency/{key}",
            payload={"response": response},
        )
        return None


ourograph_client = OurographClient()
