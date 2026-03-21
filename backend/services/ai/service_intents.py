from typing import Optional

from services.ai.intents import (
    classify_intent,
    classify_intent_by_keywords,
    parse_modify_intent,
    parse_modify_intent_by_keywords,
)
from services.ai.rag_context import retrieve_rag_context


async def classify_intent_with_service(service, user_message: str):
    return await classify_intent(service, user_message)


def classify_intent_by_keywords_only(message: str):
    return classify_intent_by_keywords(message)


async def parse_modify_intent_with_service(service, instruction: str):
    return await parse_modify_intent(service, instruction)


def parse_modify_intent_by_keywords_only(instruction: str):
    return parse_modify_intent_by_keywords(instruction)


async def retrieve_rag_context_with_service(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    score_threshold: float = 0.3,
    session_id: Optional[str] = None,
    filters: Optional[dict] = None,
):
    return await retrieve_rag_context(
        service,
        project_id=project_id,
        query=query,
        top_k=top_k,
        score_threshold=score_threshold,
        session_id=session_id,
        filters=filters,
    )


async def retrieve_rag_context_bound(
    service,
    project_id: str,
    query: str,
    top_k: int = 5,
    score_threshold: float = 0.3,
    session_id: Optional[str] = None,
    filters: Optional[dict] = None,
):
    return await retrieve_rag_context_with_service(
        service,
        project_id=project_id,
        query=query,
        top_k=top_k,
        score_threshold=score_threshold,
        session_id=session_id,
        filters=filters,
    )
