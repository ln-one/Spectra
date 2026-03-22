"""API router registration."""

from fastapi import APIRouter, FastAPI

from routers.auth import router as auth_router
from routers.chat import router as chat_router
from routers.files import router as files_router
from routers.generate_sessions import router as generate_sessions_router
from routers.health import router as health_router
from routers.project_space import router as project_space_router
from routers.projects import router as projects_router
from routers.rag import router as rag_router
from routers.system_settings import router as system_settings_router


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
    api_v1_router.include_router(
        system_settings_router,
        tags=["System Settings"],
    )
    app.include_router(api_v1_router)
