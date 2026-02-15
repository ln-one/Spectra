import json

from prisma import Prisma
from schemas.courses import CourseCreate, ProjectCreate


class DatabaseService:
    """Service for database operations using Prisma"""

    def __init__(self):
        self.db = Prisma()

    async def connect(self):
        """Connect to database"""
        await self.db.connect()

    async def disconnect(self):
        """Disconnect from database"""
        await self.db.disconnect()

    async def create_course(self, course_data: CourseCreate):
        """Create a new course"""
        chapters_json = json.dumps(
            [chapter.model_dump() for chapter in course_data.chapters]
        )
        course = await self.db.course.create(
            data={
                "title": course_data.title,
                "chapters": chapters_json,
            }
        )
        return course

    async def get_course(self, course_id: str):
        """Get a course by ID"""
        return await self.db.course.find_unique(where={"id": course_id})

    async def get_all_courses(self):
        """Get all courses"""
        return await self.db.course.find_many()

    async def create_project(self, project_data: ProjectCreate):
        """Create a new project"""
        project = await self.db.project.create(
            data={
                "name": project_data.name,
                "description": project_data.description,
            }
        )
        return project

    async def get_all_projects(self):
        """Get all projects"""
        return await self.db.project.find_many()

    async def create_upload(self, filename: str, filepath: str, size: int):
        """Record a file upload"""
        upload = await self.db.upload.create(
            data={
                "filename": filename,
                "filepath": filepath,
                "size": size,
            }
        )
        return upload


# Global database service instance
db_service = DatabaseService()
