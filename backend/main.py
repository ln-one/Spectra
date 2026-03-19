import logging
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - test/runtime fallback

    def load_dotenv(*args, **kwargs):
        return False


# Load environment variables (force backend/.env, independent of startup cwd)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

from fastapi import status  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app_setup import create_app  # noqa: E402
from app_setup.lifespan import redis_manager  # noqa: E402
from services.database import db_service  # noqa: E402
from utils.logger import setup_logging  # noqa: E402
from utils.middleware import RequestContextFilter  # noqa: E402
from utils.responses import error_response  # noqa: E402

# Configure logging from environment
log_level = os.getenv("LOG_LEVEL", "INFO")
log_format = os.getenv("LOG_FORMAT", "text")
setup_logging(log_level=log_level, log_format=log_format)

# Attach request-context filter to root logger so every handler benefits
logging.getLogger().addFilter(RequestContextFilter())

logger = logging.getLogger(__name__)
app = create_app()


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

    payload = {
        "status": "healthy" if overall_healthy else "degraded",
        "database": "connected" if db_healthy else "disconnected",
        "redis": "connected" if redis_healthy else "disconnected",
        "db_required": db_required,
        "redis_required": redis_required,
    }
    if not overall_healthy and (db_required or redis_required):
        error_payload = error_response(
            "SERVICE_UNAVAILABLE",
            "Service unavailable: one or more required dependencies are unhealthy.",
            details={"health": payload},
            retryable=True,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=error_payload
        )
    return payload


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
