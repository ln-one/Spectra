import json
import logging
from typing import Optional

from services.library_semantics import (
    ARTIFACT_SOURCE_USAGE_INTENT,
    SILENT_ACCRETION_USAGE_INTENT,
)

_UNSET = object()
logger = logging.getLogger(__name__)
_HIDDEN_UPLOAD_INTENTS = (
    SILENT_ACCRETION_USAGE_INTENT,
    ARTIFACT_SOURCE_USAGE_INTENT,
)


def _safe_parse_json_object(value) -> Optional[dict]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid parseResult JSON during artifact source lookup")
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


class FileMixin:
    @staticmethod
    def _visible_upload_where(project_id: str) -> dict:
        return {
            "projectId": project_id,
            "OR": [
                {"usageIntent": None},
                {"usageIntent": {"notIn": list(_HIDDEN_UPLOAD_INTENTS)}},
            ],
        }

    async def create_upload(
        self,
        filename: str,
        filepath: str,
        size: int,
        project_id: str,
        file_type: str,
        mime_type: Optional[str] = None,
    ):
        return await self.db.upload.create(
            data={
                "filename": filename,
                "filepath": filepath,
                "size": size,
                "projectId": project_id,
                "fileType": file_type,
                "mimeType": mime_type,
            }
        )

    async def get_project_files(self, project_id: str, page: int, limit: int):
        skip = (page - 1) * limit
        return await self.db.upload.find_many(
            where=self._visible_upload_where(project_id),
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_project_files(self, project_id: str) -> int:
        return await self.db.upload.count(where=self._visible_upload_where(project_id))

    async def get_project_artifact_source_uploads(self, project_id: str):
        return await self.db.upload.find_many(
            where={
                "projectId": project_id,
                "usageIntent": ARTIFACT_SOURCE_USAGE_INTENT,
            },
            order={"updatedAt": "desc"},
        )

    async def find_artifact_accretion_upload(
        self, project_id: str, artifact_id: str
    ):
        uploads = await self.db.upload.find_many(
            where={
                "projectId": project_id,
                "usageIntent": {"in": list(_HIDDEN_UPLOAD_INTENTS)},
            },
            order={"updatedAt": "desc"},
        )
        normalized_artifact_id = str(artifact_id or "").strip()
        if not normalized_artifact_id:
            return None
        for upload in uploads or []:
            parse_result = _safe_parse_json_object(getattr(upload, "parseResult", None))
            if str((parse_result or {}).get("artifact_id") or "").strip() == normalized_artifact_id:
                return upload
        return None

    async def get_file(self, file_id: str):
        return await self.db.upload.find_unique(where={"id": file_id})

    async def update_file_intent(self, file_id: str, usage_intent: str):
        return await self.db.upload.update(
            where={"id": file_id},
            data={"usageIntent": usage_intent},
        )

    async def delete_file(self, file_id: str):
        return await self.db.upload.delete(where={"id": file_id})

    async def update_upload_status(
        self,
        file_id: str,
        status: str,
        parse_result: Optional[dict] | object = _UNSET,
        error_message: Optional[str] | object = _UNSET,
    ):
        data: dict = {"status": status}
        if parse_result is not _UNSET:
            data["parseResult"] = (
                json.dumps(parse_result) if parse_result is not None else None
            )
        if error_message is not _UNSET:
            data["errorMessage"] = error_message
        return await self.db.upload.update(where={"id": file_id}, data=data)

    async def create_parsed_chunks(
        self, upload_id: str, source_type: str, chunks: list[dict]
    ):
        created = []
        for idx, chunk in enumerate(chunks):
            data = {
                "uploadId": upload_id,
                "content": chunk["content"],
                "chunkIndex": chunk.get("chunk_index", idx),
                "metadata": json.dumps(chunk.get("metadata", {})),
                "sourceType": source_type,
            }
            explicit_id = chunk.get("id")
            if explicit_id is not None:
                data["id"] = explicit_id
            item = await self.db.parsedchunk.create(
                data=data
            )
            created.append(item)
        return created

    async def list_parsed_chunks(self, upload_id: str):
        return await self.db.parsedchunk.find_many(
            where={"uploadId": upload_id},
            order={"chunkIndex": "asc"},
        )

    async def delete_parsed_chunks(self, upload_id: str) -> int:
        result = await self.db.parsedchunk.delete_many(where={"uploadId": upload_id})
        if isinstance(result, int):
            return result
        if hasattr(result, "count"):
            count_value = getattr(result, "count")
            try:
                return int(count_value)
            except (TypeError, ValueError):
                pass
        if isinstance(result, dict) and "count" in result:
            try:
                return int(result["count"])
            except (TypeError, ValueError):
                pass
        raise TypeError("Unexpected result type from delete_many: cannot extract count")

    async def get_idempotency_response(self, key: str):
        record = await self.db.idempotencykey.find_unique(where={"key": key})
        if not record:
            return None
        try:
            return json.loads(record.response)
        except (TypeError, json.JSONDecodeError):
            return None

    async def save_idempotency_response(self, key: str, response: dict):
        return await self.db.idempotencykey.upsert(
            where={"key": key},
            data={
                "create": {"key": key, "response": json.dumps(response)},
                "update": {"response": json.dumps(response)},
            },
        )
