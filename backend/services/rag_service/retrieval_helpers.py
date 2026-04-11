import logging

try:
    from prisma.errors import ClientNotConnectedError
except Exception:  # pragma: no cover - prisma may be unavailable in some test envs

    class ClientNotConnectedError(Exception):
        pass


from schemas.rag import RAGResult
from services.database import db_service

logger = logging.getLogger(__name__)


async def list_active_reference_targets(project_id: str) -> list[dict]:
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
    targets = []
    for reference in references:
        targets.append(
            {
                "source_project_id": reference.targetProjectId,
                "source_scope": (
                    "reference_base"
                    if reference.relationType == "base"
                    else "reference_auxiliary"
                ),
                "relation_type": reference.relationType,
                "reference_mode": reference.mode,
                "reference_priority": reference.priority,
                "pinned_version_id": getattr(reference, "pinnedVersionId", None),
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
    elif source_scope == "reference_base":
        scope_rank = 2
    else:
        scope_rank = 3
    priority = int(meta.get("reference_priority") or 0)
    return (scope_rank, priority, -item.score)
