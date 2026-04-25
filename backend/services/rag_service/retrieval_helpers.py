import logging

try:
    from prisma.errors import ClientNotConnectedError
except Exception:  # pragma: no cover - prisma may be unavailable in some test envs

    class ClientNotConnectedError(Exception):
        pass


from schemas.rag import RAGResult
from services.database import db_service

logger = logging.getLogger(__name__)


def _row_field(row, name: str):
    if isinstance(row, dict):
        return row.get(name)
    return getattr(row, name, None)


async def list_active_reference_targets(
    project_id: str,
    *,
    selected_library_ids: list[str] | None = None,
) -> list[dict]:
    try:
        from services.project_space_service.service import project_space_service

        project = await db_service.get_project(project_id)
        project_owner_id = getattr(project, "userId", None) if project else None
        if not project_owner_id:
            return []
        references = await project_space_service.get_project_references(
            project_id=project_id,
            user_id=project_owner_id,
        )
    except ClientNotConnectedError:
        return []
    except Exception as exc:
        logger.warning(
            "reference target lookup failed for project %s: %s", project_id, exc
        )
        return []
    allowed_library_ids = {
        str(item).strip()
        for item in (selected_library_ids or [])
        if str(item).strip()
    }
    if selected_library_ids is not None and not allowed_library_ids:
        return []

    project_names_by_id: dict[str, str] = {}
    target_ids = [
        str(reference.targetProjectId or "").strip() for reference in references or []
    ]
    target_ids = [target_id for target_id in target_ids if target_id]
    if target_ids:
        try:
            project_rows = await db_service.db.project.find_many(
                where={"id": {"in": target_ids}},
                select={"id": True, "name": True},
            )
            project_names_by_id = {
                str(_row_field(row, "id") or ""): str(
                    _row_field(row, "name") or ""
                ).strip()
                for row in (project_rows or [])
                if str(_row_field(row, "id") or "").strip()
            }
        except TypeError:
            project_rows = await db_service.db.project.find_many(
                where={"id": {"in": target_ids}}
            )
            project_names_by_id = {
                str(getattr(row, "id", "") or ""): str(
                    getattr(row, "name", "") or ""
                ).strip()
                for row in (project_rows or [])
                if str(getattr(row, "id", "") or "").strip()
            }
        except Exception as exc:
            logger.warning("reference target name lookup failed: %s", exc)

    targets = []
    for reference in references:
        target_project_id = str(reference.targetProjectId or "").strip()
        if not target_project_id:
            continue
        if allowed_library_ids and target_project_id not in allowed_library_ids:
            continue
        targets.append(
            {
                "source_project_id": target_project_id,
                "source_scope": "attached_library",
                "relation_type": reference.relationType,
                "reference_mode": reference.mode,
                "reference_priority": reference.priority,
                "pinned_version_id": getattr(reference, "pinnedVersionId", None),
                "source_library_id": target_project_id,
                "source_library_name": (
                    project_names_by_id.get(target_project_id) or None
                ),
            }
        )
    return targets


def sort_key(item: RAGResult) -> tuple[int, int, float]:
    meta = item.metadata or {}
    source_scope = meta.get("source_scope")
    if source_scope == "local_session":
        scope_rank = 0
    elif source_scope == "local_project":
        scope_rank = 1
    elif source_scope in {"attached_library", "reference_base", "reference_auxiliary"}:
        scope_rank = 2
    else:
        scope_rank = 3
    priority = int(meta.get("reference_priority") or 0)
    return (scope_rank, priority, -item.score)
