"""Application middleware registration."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from utils.middleware import RequestIDMiddleware


def register_middleware(app: FastAPI) -> None:
    """Register shared middleware in the intended order."""
    raw_origins = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    clean_origins = [origin.strip() for origin in raw_origins if origin.strip()]
    clean_origins = [origin for origin in clean_origins if origin != "*"]
    allow_all_origins = any(origin.strip() == "*" for origin in raw_origins)
    allow_all_origins = allow_all_origins or not clean_origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all_origins else clean_origins,
        allow_credentials=not allow_all_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )
    app.add_middleware(RequestIDMiddleware)
