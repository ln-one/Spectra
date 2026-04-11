"""Project-space service package.

Production code should import concrete modules directly.
Tests may still patch ``services.project_space_service.project_space_service``
while the repo finishes migrating to explicit module imports.
"""

from .service import project_space_service

__all__ = ["project_space_service"]
