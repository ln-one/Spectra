import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import courses_router, generate_router, projects_router, upload_router
from services import db_service

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup: Connect to database
    await db_service.connect()
    yield
    # Shutdown: Disconnect from database
    await db_service.disconnect()


# Initialize FastAPI app
app = FastAPI(
    title="Spectra Backend",
    description="FastAPI backend with Python 3.11, Pydantic v2, and Prisma ORM",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure with specific origins in production via env vars
    allow_credentials=False,  # Disabled for security when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload_router)
app.include_router(generate_router)
app.include_router(projects_router)
app.include_router(courses_router)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Spectra Backend API",
        "version": "1.0.0",
        "endpoints": {
            "upload": "/upload",
            "generate": "/generate",
            "projects": "/projects",
            "courses": "/courses",
        },
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
