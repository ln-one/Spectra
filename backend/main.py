import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prisma.errors import PrismaError

from routers import (
    auth_router,
    chat_router,
    courses_router,
    download_router,
    files_router,
    generate_router,
    generate_sessions_router,
    health_router,
    preview_router,
    projects_router,
    rag_router,
)
from services import db_service
from services.redis_manager import RedisConnectionManager
from utils.exceptions import APIException
from utils.logger import setup_logging
from utils.middleware import RequestContextFilter, RequestIDMiddleware
from utils.responses import error_response

# Load environment variables
load_dotenv()

# Configure logging from environment
log_level = os.getenv("LOG_LEVEL", "INFO")
log_format = os.getenv("LOG_FORMAT", "text")
setup_logging(log_level=log_level, log_format=log_format)

# Attach request-context filter to root logger so every handler benefits
logging.getLogger().addFilter(RequestContextFilter())

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

# --- Middleware (order matters: outermost first) ---

# CORS must be outermost so preflight responses include correct headers
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_credentials=False,  # Disabled for security when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request-ID & access-log middleware
app.add_middleware(RequestIDMiddleware)

# Create API v1 router
api_v1_router = APIRouter(prefix="/api/v1")

# Include routers under /api/v1
api_v1_router.include_router(auth_router, tags=["Auth"])
api_v1_router.include_router(chat_router, tags=["Chat"])
api_v1_router.include_router(files_router, tags=["Files"])
api_v1_router.include_router(generate_router, tags=["Generate"])
api_v1_router.include_router(generate_sessions_router, tags=["Generate"])
api_v1_router.include_router(download_router, tags=["Generate"])
api_v1_router.include_router(health_router, tags=["Health"])
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
    from utils.middleware import get_request_id

    details = dict(exc.details) if exc.details else {}
    rid = get_request_id()
    if rid:
        details["request_id"] = rid

    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            code=exc.error_code.value,
            message=exc.message,
            details=details or None,
        ),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors"""
    from utils.middleware import get_request_id

    details: dict = {"errors": exc.errors()}
    rid = get_request_id()
    if rid:
        details["request_id"] = rid

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=error_response(
            code="VALIDATION_ERROR",
            message="请求参数验证失败",
            details=details,
        ),
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions with fine-grained mapping to reduce 500s."""
    from utils.middleware import get_request_id

    rid = get_request_id() or "-"

    # Map well-known library exceptions to appropriate HTTP status codes
    if isinstance(exc, PrismaError):
        logger.error(
            "database_error: %s request_id=%s",
            exc,
            rid,
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response(
                code="SERVICE_UNAVAILABLE",
                message="数据库服务暂不可用，请稍后重试",
                details={"request_id": rid},
            ),
        )

    if isinstance(exc, (ValueError, TypeError, KeyError)):
        logger.warning(
            "bad_request_mapped: %s request_id=%s",
            exc,
            rid,
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_response(
                code="INVALID_INPUT",
                message="请求参数错误",
                details={"request_id": rid},
            ),
        )

    if isinstance(exc, (TimeoutError, ConnectionError)):
        logger.error(
            "upstream_timeout: %s request_id=%s",
            exc,
            rid,
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=error_response(
                code="EXTERNAL_SERVICE_ERROR",
                message="上游服务超时或不可达",
                details={"request_id": rid},
            ),
        )

    # Fallback – genuine 500
    logger.error(
        "unhandled_error: %s request_id=%s",
        exc,
        rid,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(
            code="INTERNAL_ERROR",
            message="服务器内部错误",
            details={"request_id": rid},
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
    try:
        # SQLite 下 execute_raw("SELECT 1") 会报 P2010（SELECT 返回结果不允许），
        # 这里改用 query_raw 做纯连通性探测。
        await db_service.db.query_raw("SELECT 1")
        db_healthy = True
    except Exception:
        db_healthy = False
    redis_healthy = await redis_manager.health_check()
    db_required = os.getenv("DB_REQUIRED", "false").lower() == "true"
    redis_required = os.getenv("REDIS_REQUIRED", "false").lower() == "true"
    overall_healthy = (db_healthy or not db_required) and (
        redis_healthy or not redis_required
    )

    return {
        "status": "healthy" if overall_healthy else "degraded",
        "database": "connected" if db_healthy else "disconnected",
        "redis": "connected" if redis_healthy else "disconnected",
        "db_required": db_required,
        "redis_required": redis_required,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
