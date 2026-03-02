import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import (
    auth_router,
    chat_router,
    courses_router,
    download_router,
    files_router,
    generate_router,
    preview_router,
    projects_router,
    rag_router,
)
from services import db_service
from services.redis_manager import RedisConnectionManager
from utils.exceptions import APIException
from utils.logger import setup_logging
from utils.responses import error_response

# Load environment variables
load_dotenv()

# Configure logging from environment
log_level = os.getenv("LOG_LEVEL", "INFO")
log_format = os.getenv("LOG_FORMAT", "text")
setup_logging(log_level=log_level, log_format=log_format)

logger = logging.getLogger(__name__)

# Initialize Redis connection manager
redis_manager = RedisConnectionManager.from_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup: Connect to database and Redis
    await db_service.connect()
    try:
        await redis_manager.connect()
        logger.info("Redis connection established")

        # Initialize task queue service
        from services.task_queue import TaskQueueService

        redis_conn = redis_manager.get_connection()
        app.state.task_queue_service = TaskQueueService(redis_conn)
        logger.info("Task queue service initialized")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        logger.warning("Application starting without Redis - task queue will not work")
        app.state.task_queue_service = None

    yield

    # Shutdown: Disconnect from database and Redis
    await redis_manager.disconnect()
    await db_service.disconnect()


# Initialize FastAPI app
app = FastAPI(
    title="Spectra Backend",
    description="FastAPI backend with Python 3.11, Pydantic v2, and Prisma ORM",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
# REVIEW #B8 (P1): 这里仍为硬编码 allow_origins=["*"]，未消费 CORS_ORIGINS 环境变量，和环境文档口径不一致。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure with specific origins in production via env vars
    allow_credentials=False,  # Disabled for security when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create API v1 router
api_v1_router = APIRouter(prefix="/api/v1")

# Include routers under /api/v1
api_v1_router.include_router(auth_router, tags=["Auth"])
api_v1_router.include_router(chat_router, tags=["Chat"])
api_v1_router.include_router(files_router, tags=["Files"])
api_v1_router.include_router(generate_router, tags=["Generate"])
api_v1_router.include_router(download_router, tags=["Generate"])
api_v1_router.include_router(preview_router, tags=["Preview"])
api_v1_router.include_router(projects_router, tags=["Projects"])
api_v1_router.include_router(rag_router, tags=["RAG"])
api_v1_router.include_router(courses_router, tags=["Courses"])

# Include the versioned API router
app.include_router(api_v1_router)


# ============================================
# Global Exception Handlers
# ============================================


@app.exception_handler(APIException)
async def api_exception_handler(request: Request, exc: APIException):
    """Handle custom API exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            code=exc.error_code.value, message=exc.message, details=exc.details
        ),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=error_response(
            code="VALIDATION_ERROR",
            message="请求参数验证失败",
            details={"errors": exc.errors()},
        ),
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(
            code="INTERNAL_ERROR",
            message="服务器内部错误",
            details={"error": str(exc)} if app.debug else None,
        ),
    )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Spectra Backend API",
        "version": "1.0.0",
        "docs": "/docs",
        "api_v1": "/api/v1",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    db_healthy = True
    redis_healthy = await redis_manager.health_check()

    return {
        "status": "healthy" if (db_healthy and redis_healthy) else "degraded",
        "database": "connected" if db_healthy else "disconnected",
        "redis": "connected" if redis_healthy else "disconnected",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
