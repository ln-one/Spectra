"""API router registration."""

from fastapi import APIRouter, FastAPI

from routers import (
    auth_router,
    chat_router,
    files_router,
    generate_sessions_router,
    health_router,
    project_space_router,
    projects_router,
    rag_router,
)


def register_routes(app: FastAPI) -> None:
    """Attach all versioned API routers to the application."""
    api_v1_router = APIRouter(prefix="/api/v1")
    api_v1_router.include_router(auth_router, tags=["Auth"])
    api_v1_router.include_router(chat_router, tags=["Chat"])
    api_v1_router.include_router(files_router, tags=["Files"])
    api_v1_router.include_router(generate_sessions_router, tags=["Generate"])
    api_v1_router.include_router(health_router, tags=["Health"])
    api_v1_router.include_router(projects_router, tags=["Projects"])
    api_v1_router.include_router(project_space_router, tags=["Project Space"])
    api_v1_router.include_router(rag_router, tags=["RAG"])
    app.include_router(api_v1_router)
