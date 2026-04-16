"""Thin Spectra facade over remote Ourograph formal-state APIs.

This package is kept for compatibility and route-level orchestration only.
It is not a second implementation of project-space formal semantics.

Production code should import concrete modules directly.
Tests may still patch ``services.project_space_service.project_space_service``
while the repo finishes migrating to explicit module imports.
"""

from .service import project_space_service

__all__ = ["project_space_service"]
