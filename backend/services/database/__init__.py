from .service import DatabaseService


class _DatabaseServiceProxy:
    """Lazy proxy that defers Prisma client initialization until first use."""

    def __init__(self) -> None:
        self._instance: DatabaseService | None = None

    def _get_instance(self) -> DatabaseService:
        if self._instance is None:
            self._instance = DatabaseService()
        return self._instance

    def __getattr__(self, name: str):
        if self._instance is None and hasattr(DatabaseService, name):
            class_attr = getattr(DatabaseService, name)
            if callable(class_attr):

                def _lazy_method(*args, **kwargs):
                    target = getattr(self._get_instance(), name)
                    return target(*args, **kwargs)

                return _lazy_method
        return getattr(self._get_instance(), name)


# Keep import compatibility with `from services.database import db_service`.
db_service = _DatabaseServiceProxy()

__all__ = ["DatabaseService", "db_service"]
