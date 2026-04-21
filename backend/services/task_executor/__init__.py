from rq import get_current_job

from .indexing import execute_rag_indexing_task, run_rag_indexing_task
from .prompt_suggestions import (
    execute_prompt_suggestion_pool_task,
    run_prompt_suggestion_pool_task,
)
from .remote_parse import (
    execute_remote_parse_reconcile_task,
    run_remote_parse_reconcile_task,
)
from .requirements import build_user_requirements, load_session_outline

_build_user_requirements = build_user_requirements
_load_session_outline = load_session_outline

__all__ = [
    "get_current_job",
    "run_rag_indexing_task",
    "execute_rag_indexing_task",
    "run_prompt_suggestion_pool_task",
    "execute_prompt_suggestion_pool_task",
    "run_remote_parse_reconcile_task",
    "execute_remote_parse_reconcile_task",
    "build_user_requirements",
    "load_session_outline",
    "_build_user_requirements",
    "_load_session_outline",
]
