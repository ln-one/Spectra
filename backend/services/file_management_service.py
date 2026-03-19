import pathlib
from typing import Callable

from services import db_service
from services.file_upload_service import serialize_upload
from utils.exceptions import ForbiddenException, NotFoundException
from utils.responses import success_response


async def get_owned_file(file_id: str, user_id: str):
    file = await db_service.get_file(file_id)
    if not file:
        raise NotFoundException(message=f"文件不存在: {file_id}")

    project = await db_service.get_project(file.projectId)
    if not project or project.userId != user_id:
        raise ForbiddenException(message="无权限访问此文件")
    return file


async def update_file_intent_response(file_id: str, usage_intent: str, user_id: str):
    await get_owned_file(file_id, user_id)
    updated_file = await db_service.update_file_intent(file_id, usage_intent)
    return success_response(
        data={"file": serialize_upload(updated_file)},
        message="文件用途标注成功",
    )


async def batch_delete_files_response(
    file_ids: list[str],
    user_id: str,
    cleanup_func: Callable[[pathlib.Path], None],
):
    deleted = 0
    failed = []
    for file_id in file_ids:
        try:
            file = await get_owned_file(file_id, user_id)
            await db_service.delete_file(file_id)
            cleanup_func(pathlib.Path(file.filepath))
            deleted += 1
        except NotFoundException:
            failed.append({"file_id": file_id, "error": "文件不存在"})
        except ForbiddenException:
            failed.append({"file_id": file_id, "error": "无权限删除此文件"})
        except Exception as exc:
            failed.append({"file_id": file_id, "error": str(exc)})

    return success_response(
        data={"deleted": deleted, "failed": failed or None},
        message="批量删除完成",
    )


async def delete_file_response(
    file_id: str,
    user_id: str,
    cleanup_func: Callable[[pathlib.Path], None],
):
    file = await get_owned_file(file_id, user_id)
    await db_service.delete_file(file_id)
    cleanup_func(pathlib.Path(file.filepath))
    return file
