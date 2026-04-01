import json
from typing import Optional

from services.library_semantics import SILENT_ACCRETION_USAGE_INTENT

_UNSET = object()


class FileMixin:
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
            where={
                "projectId": project_id,
                "OR": [
                    {"usageIntent": None},
                    {"usageIntent": {"not": SILENT_ACCRETION_USAGE_INTENT}},
                ],
            },
            skip=skip,
            take=limit,
            order={"createdAt": "desc"},
        )

    async def count_project_files(self, project_id: str) -> int:
        return await self.db.upload.count(
            where={
                "projectId": project_id,
                "OR": [
                    {"usageIntent": None},
                    {"usageIntent": {"not": SILENT_ACCRETION_USAGE_INTENT}},
                ],
            }
        )

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
