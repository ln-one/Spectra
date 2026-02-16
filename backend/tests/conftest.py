import pytest
from starlette.testclient import TestClient

from main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_course_data():
    return {
        "title": "Test Course",
        "description": "Test course description",
    }
