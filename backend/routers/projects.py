from fastapi import APIRouter, HTTPException
import logging
from typing import List
from services import db_service
from schemas import ProjectResponse, ProjectCreate

router = APIRouter(prefix="/projects", tags=["Projects"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[ProjectResponse])
async def get_projects():
    """
    Get all projects
    
    Returns:
        List of all projects
    """
    try:
        projects = await db_service.get_all_projects()
        return projects
    except Exception as e:
        logger.error(f"Failed to fetch projects: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


@router.post("", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    """
    Create a new project
    
    Args:
        project: Project data
        
    Returns:
        Created project
    """
    try:
        new_project = await db_service.create_project(project)
        return new_project
    except Exception as e:
        logger.error(f"Failed to create project: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create project")
