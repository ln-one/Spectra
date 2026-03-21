import asyncio
import logging
import os
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - test/runtime fallback

    def load_dotenv(*args, **kwargs):
        return False


# Load environment variables (force backend/.env, independent of startup cwd)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
from services.runtime_env import normalize_database_url_for_host_runtime  # noqa: E402

normalize_database_url_for_host_runtime()

from fastapi import status  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app_setup import create_app  # noqa: E402
from app_setup.lifespan import redis_manager  # noqa: E402
from services.database import db_service  # noqa: E402
from services.generation.tool_checker import (  # noqa: E402
    check_marp_installed,
    check_pandoc_installed,
)
from utils.generation_exceptions import ToolNotFoundError  # noqa: E402
from utils.logger import setup_logging  # noqa: E402
from utils.middleware import RequestContextFilter, get_request_id  # noqa: E402
from utils.responses import error_response  # noqa: E402

# Configure logging from environment
log_level = os.getenv("LOG_LEVEL", "INFO")
log_format = os.getenv("LOG_FORMAT", "text")
setup_logging(log_level=log_level, log_format=log_format)

# Attach request-context filter to root logger so every handler benefits
logging.getLogger().addFilter(RequestContextFilter())

logger = logging.getLogger(__name__)
app = create_app()


def _dependency_timeout_seconds() -> float:
    raw = os.getenv("HEALTH_DEPENDENCY_TIMEOUT_SECONDS", "3").strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 3.0
    except ValueError:
        return 3.0


def _tool_timeout_seconds() -> float:
    raw = os.getenv("HEALTH_TOOL_TIMEOUT_SECONDS", "2").strip()
    try:
        parsed = float(raw)
        return parsed if parsed > 0 else 2.0
    except ValueError:
        return 2.0


def _generation_tools_required() -> bool:
    return os.getenv("GENERATION_TOOLS_REQUIRED", "false").lower() == "true"


async def _probe_database(timeout_seconds: float) -> tuple[bool, float]:
    started_at = time.perf_counter()
    try:
        await asyncio.wait_for(db_service.db.query_raw("SELECT 1"), timeout_seconds)
        return True, round((time.perf_counter() - started_at) * 1000, 2)
    except Exception:
        return False, round((time.perf_counter() - started_at) * 1000, 2)


async def _probe_redis(timeout_seconds: float) -> tuple[bool, float]:
    started_at = time.perf_counter()
    try:
        healthy = await asyncio.wait_for(redis_manager.health_check(), timeout_seconds)
        return bool(healthy), round((time.perf_counter() - started_at) * 1000, 2)
    except Exception:
        return False, round((time.perf_counter() - started_at) * 1000, 2)


def _safe_probe_generation_tool(checker) -> str:
    try:
        return "available" if checker() else "unavailable"
    except ToolNotFoundError:
        return "unavailable"
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.warning("Generation tool probe failed: %s", exc)
        return "unavailable"


def _collect_generation_tools_status() -> dict[str, object]:
    marp_status = _safe_probe_generation_tool(check_marp_installed)
    pandoc_status = _safe_probe_generation_tool(check_pandoc_installed)
    healthy = marp_status == "available" and pandoc_status == "available"
    return {
        "marp": marp_status,
        "pandoc": pandoc_status,
        "healthy": healthy,
        "timed_out": False,
    }


async def _probe_generation_tools(timeout_seconds: float) -> tuple[dict, float]:
    started_at = time.perf_counter()
    try:
        status_payload = await asyncio.wait_for(
            asyncio.to_thread(_collect_generation_tools_status),
            timeout=timeout_seconds,
        )
        return status_payload, round((time.perf_counter() - started_at) * 1000, 2)
    except asyncio.TimeoutError:
        return (
            {
                "marp": "unknown",
                "pandoc": "unknown",
                "healthy": False,
                "timed_out": True,
            },
            round((time.perf_counter() - started_at) * 1000, 2),
        )
    except Exception:  # pragma: no cover - defensive runtime path
        return (
            {
                "marp": "unknown",
                "pandoc": "unknown",
                "healthy": False,
                "timed_out": False,
            },
            round((time.perf_counter() - started_at) * 1000, 2),
        )


async def _build_health_payload() -> tuple[dict, bool]:
    timeout_seconds = _dependency_timeout_seconds()
    db_healthy, db_latency_ms = await _probe_database(timeout_seconds)
    redis_healthy, redis_latency_ms = await _probe_redis(timeout_seconds)
    tool_timeout_seconds = _tool_timeout_seconds()
    generation_tools, tools_latency_ms = await _probe_generation_tools(
        tool_timeout_seconds
    )
    db_required = os.getenv("DB_REQUIRED", "false").lower() == "true"
    redis_required = os.getenv("REDIS_REQUIRED", "false").lower() == "true"
    tools_required = _generation_tools_required()
    tools_healthy = bool(generation_tools.get("healthy"))
    overall_healthy = (
        (db_healthy or not db_required)
        and (redis_healthy or not redis_required)
        and (tools_healthy or not tools_required)
    )

    payload = {
        "status": "healthy" if overall_healthy else "degraded",
        "database": "connected" if db_healthy else "disconnected",
        "redis": "connected" if redis_healthy else "disconnected",
        "db_required": db_required,
        "redis_required": redis_required,
        "generation_tools": {
            "marp": generation_tools.get("marp", "unknown"),
            "pandoc": generation_tools.get("pandoc", "unknown"),
            "required": tools_required,
            "healthy": tools_healthy,
            "timed_out": bool(generation_tools.get("timed_out")),
        },
        "dependency_timeout_seconds": timeout_seconds,
        "tool_timeout_seconds": tool_timeout_seconds,
        "latency_ms": {
            "database": db_latency_ms,
            "redis": redis_latency_ms,
            "generation_tools": tools_latency_ms,
        },
    }
    return payload, overall_healthy


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
    payload, overall_healthy = await _build_health_payload()
    if not overall_healthy and (
        payload["db_required"]
        or payload["redis_required"]
        or payload["generation_tools"]["required"]
    ):
        request_id = get_request_id()
        error_payload = error_response(
            "SERVICE_UNAVAILABLE",
            "Service unavailable: one or more required dependencies are unhealthy.",
            details={"health": payload},
            retryable=True,
            trace_id=request_id,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=error_payload
        )
    return payload


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    """Readiness endpoint for orchestrators (dependency-aware)."""
    return await health_check()


@app.get("/health/live", tags=["Health"])
async def liveness_check():
    """Liveness endpoint for orchestrators (process-only)."""
    return {"status": "alive"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
