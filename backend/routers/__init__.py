from .auth import router as auth_router
from .chat import router as chat_router
from .courses import router as courses_router
from .files import router as files_router
from .generate import router as generate_router
from .preview import router as preview_router
from .projects import router as projects_router
from .rag import router as rag_router

__all__ = [
    "auth_router",
    "chat_router",
    "files_router",
    "generate_router",
    "preview_router",
    "projects_router",
    "rag_router",
    "courses_router",
]
