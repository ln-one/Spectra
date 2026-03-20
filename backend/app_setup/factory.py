"""FastAPI application factory."""

from fastapi import FastAPI

from app_setup.exceptions import register_exception_handlers
from app_setup.lifespan import create_lifespan
from app_setup.middleware import register_middleware
from app_setup.routes import register_routes


def create_app() -> FastAPI:
    """Create and configure the Spectra backend application."""
    app = FastAPI(
        title="Spectra Backend",
        description="FastAPI backend with Python 3.11, Pydantic v2, and Prisma ORM",
        version="1.0.0",
        lifespan=create_lifespan(),
    )
    register_middleware(app)
    register_routes(app)
    register_exception_handlers(app)
    return app
