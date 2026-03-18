from rq import get_current_job

from .generation import execute_generation_task, run_generation_task
from .indexing import execute_rag_indexing_task, run_rag_indexing_task
from .outline import execute_outline_draft_task, run_outline_draft_task
from .requirements import build_user_requirements, load_session_outline

_build_user_requirements = build_user_requirements
_load_session_outline = load_session_outline

__all__ = [
    "get_current_job",
    "run_generation_task",
    "execute_generation_task",
    "run_rag_indexing_task",
    "execute_rag_indexing_task",
    "run_outline_draft_task",
    "execute_outline_draft_task",
    "build_user_requirements",
    "load_session_outline",
    "_build_user_requirements",
    "_load_session_outline",
]
