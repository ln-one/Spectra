from .auth import router as auth_router
from .chat import router as chat_router
from .courses import router as courses_router
from .files import router as files_router
from .generate_sessions import router as generate_sessions_router
from .health import router as health_router
from .projects import router as projects_router
from .rag import router as rag_router

__all__ = [
    "auth_router",
    "chat_router",
    "courses_router",
    "files_router",
    "generate_sessions_router",
    "health_router",
    "projects_router",
    "rag_router",
]
