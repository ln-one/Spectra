"""Lazy compatibility exports for legacy project-space service access."""

__all__ = ["ProjectSpaceService", "project_space_service"]


def __getattr__(name: str):
    if name in __all__:
        from .service import ProjectSpaceService, project_space_service

        exports = {
            "ProjectSpaceService": ProjectSpaceService,
            "project_space_service": project_space_service,
        }
        return exports[name]
    raise AttributeError(name)
