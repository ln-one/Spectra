from .service import DatabaseService

# Global database service instance
# Kept here so existing imports `from services.database import db_service` stay stable.
db_service = DatabaseService()

__all__ = ["DatabaseService", "db_service"]
