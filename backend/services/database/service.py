from services.prisma_runtime import ensure_generated_prisma_client_path

from .files import FileMixin
from .projects import ProjectMixin
from .users_conversations import UserConversationMixin


class DatabaseService(
    ProjectMixin,
    FileMixin,
    UserConversationMixin,
):
    """Service for database operations using Prisma."""

    def __init__(self):
        ensure_generated_prisma_client_path()
        from prisma import Prisma

        self.db = Prisma()

    async def connect(self):
        await self.db.connect()

    async def disconnect(self):
        await self.db.disconnect()
