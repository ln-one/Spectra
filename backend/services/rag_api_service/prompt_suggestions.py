from schemas.rag import PromptSuggestionRequest
from services.prompt_suggestion_pool import prompt_suggestions_pool_response


async def prompt_suggestions_response(
    request: PromptSuggestionRequest,
    user_id: str,
    *,
    task_queue_service=None,
):
    return await prompt_suggestions_pool_response(
        request,
        user_id,
        task_queue_service=task_queue_service,
    )
