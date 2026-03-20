import json
from datetime import datetime
from typing import Optional

from schemas.project_space import CandidateChangeStatus


class ProjectSpaceChangeMixin:
    async def get_candidate_changes(
        self,
        project_id: str,
        status: Optional[CandidateChangeStatus | str] = None,
        proposer_user_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        where: dict = {"projectId": project_id}
        if status:
            where["status"] = (
                status.value
                if isinstance(status, CandidateChangeStatus)
                else CandidateChangeStatus(status).value
            )
        if proposer_user_id:
            where["proposerUserId"] = proposer_user_id
        if session_id:
            where["sessionId"] = session_id
        return await self.db.candidatechange.find_many(
            where=where, order={"createdAt": "desc"}
        )

    async def get_candidate_change(self, change_id: str):
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
        data = {"projectId": project_id, "title": title}
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
        status: CandidateChangeStatus | str,
        review_comment: Optional[str] = None,
        reviewed_by: Optional[str] = None,
        reviewed_at: Optional[datetime] = None,
        payload: Optional[dict] = None,
    ):
        normalized_status = (
            status
            if isinstance(status, CandidateChangeStatus)
            else CandidateChangeStatus(status)
        )
        data = {"status": normalized_status}
        if review_comment is not None:
            data["reviewComment"] = review_comment
        if reviewed_by is not None:
            data["reviewedBy"] = reviewed_by
        if reviewed_at is not None:
            data["reviewedAt"] = reviewed_at
        if payload is not None:
            data["payload"] = json.dumps(payload)
        return await self.db.candidatechange.update(where={"id": change_id}, data=data)
