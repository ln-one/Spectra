from prisma import Prisma

from .files import FileMixin
from .generation_tasks import GenerationTaskMixin
from .project_space import ProjectSpaceMixin
from .projects import ProjectMixin
from .users_conversations import UserConversationMixin


class DatabaseService(
    ProjectMixin,
    FileMixin,
    UserConversationMixin,
    GenerationTaskMixin,
    ProjectSpaceMixin,
):
    """Service for database operations using Prisma."""

    def __init__(self):
        self.db = Prisma()

    async def connect(self):
        await self.db.connect()

    async def disconnect(self):
        await self.db.disconnect()
