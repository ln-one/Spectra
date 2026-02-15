# Spectra-Backend

FastAPI backend project with Python 3.11, Pydantic v2, and Prisma ORM. Optimized for stable AI-native coding.

## Features

- **FastAPI**: Modern, fast web framework for building APIs
- **Pydantic v2**: Data validation using Python type annotations
- **Prisma Client Python**: Next-generation ORM for Python
- **LiteLLM**: Unified API for multiple LLM providers
- **CORS Enabled**: Cross-Origin Resource Sharing support
- **Structured**: Clean separation with /routers, /services, /schemas

## Project Structure

```
Spectra-Backend/
├── routers/          # API route handlers
│   ├── upload.py     # File upload endpoints
│   ├── generate.py   # AI generation endpoints
│   ├── projects.py   # Project management endpoints
│   └── courses.py    # Course management endpoints
├── services/         # Business logic layer
│   ├── database.py   # Database operations
│   ├── ai.py         # AI service integration
│   └── file.py       # File handling
├── schemas/          # Pydantic models
│   └── courses.py    # Data validation schemas
├── prisma/           # Prisma ORM
│   └── schema.prisma # Database schema
├── uploads/          # Uploaded files directory
├── main.py           # Application entry point
└── requirements.txt  # Python dependencies
```

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Generate Prisma client**:
   ```bash
   prisma generate
   ```

4. **Run database migrations**:
   ```bash
   prisma db push
   ```

5. **Start the server**:
   ```bash
   uvicorn main:app --reload
   ```

The API will be available at `http://localhost:8000`

## API Endpoints

### Root
- `GET /` - Welcome message and endpoint list
- `GET /health` - Health check

### Upload
- `POST /upload` - Upload a file

### AI Generation
- `POST /generate` - Generate AI content using LiteLLM
  - Body: `{"prompt": "Your prompt", "model": "gpt-3.5-turbo", "max_tokens": 500}`

### Projects
- `GET /projects` - Get all projects
- `POST /projects` - Create a new project

### Courses
- `GET /courses` - Get all courses
- `POST /courses` - Create a new course
- `GET /courses/{course_id}` - Get a specific course

## Models

### Course Model
```python
class Course:
    title: str
    chapters: List[Chapter]
    # Each chapter has: title, content, order
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Development

The project uses:
- Python 3.11+
- FastAPI for the web framework
- Pydantic v2 for data validation
- Prisma for database ORM
- LiteLLM for AI integrations
- SQLite for development database

## License

MIT