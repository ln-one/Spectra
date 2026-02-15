import json
import logging
from typing import List

from fastapi import APIRouter, HTTPException

from schemas import ChapterSchema, CourseCreate, CourseResponse
from services import db_service

router = APIRouter(prefix="/courses", tags=["Courses"])
logger = logging.getLogger(__name__)


def transform_course(course):
    """Transform database course to response model"""
    chapters_data = (
        json.loads(course.chapters)
        if isinstance(course.chapters, str)
        else course.chapters
    )
    return CourseResponse(
        id=course.id,
        title=course.title,
        chapters=[ChapterSchema(**ch) for ch in chapters_data],
        createdAt=course.createdAt,
        updatedAt=course.updatedAt,
    )


@router.post("", response_model=CourseResponse)
async def create_course(course: CourseCreate):
    """
    Create a new course

    Args:
        course: Course data with title and chapters

    Returns:
        Created course
    """
    try:
        new_course = await db_service.create_course(course)
        return transform_course(new_course)
    except Exception as e:
        logger.error(f"Failed to create course: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create course")


@router.get("", response_model=List[CourseResponse])
async def get_courses():
    """
    Get all courses

    Returns:
        List of all courses
    """
    try:
        courses = await db_service.get_all_courses()
        return [transform_course(course) for course in courses]
    except Exception as e:
        logger.error(f"Failed to fetch courses: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch courses")


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(course_id: str):
    """
    Get a specific course by ID

    Args:
        course_id: Course ID

    Returns:
        Course details
    """
    try:
        course = await db_service.get_course(course_id)
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return transform_course(course)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch course: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch course")
