from .upload import router as upload_router
from .generate import router as generate_router
from .projects import router as projects_router
from .courses import router as courses_router

__all__ = ["upload_router", "generate_router", "projects_router", "courses_router"]
