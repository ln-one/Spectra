# Router Updates - Task 3.7

## Summary

Updated three existing routers to add authentication dependencies and align with OpenAPI specification.

## Changes Made

### 1. `backend/routers/projects.py`

**Added:**
- Authentication dependency (`get_current_user`) to all endpoints
- Pagination support (page, limit query parameters)
- Idempotency-Key support for POST endpoint
- New endpoint: `GET /projects/{project_id}` - Get project details
- New endpoint: `GET /projects/{project_id}/files` - Get project files list
- Structured logging with user_id context
- Unified response format using `success_response()`
- Proper error handling with `APIException`

**Updated Endpoints:**
- `POST /projects` - Now requires authentication, supports idempotency
- `GET /projects` - Now requires authentication, supports pagination

### 2. `backend/routers/files.py`

**Added:**
- Authentication dependency (`get_current_user`) to all endpoints
- `project_id` as required form parameter for file upload
- Idempotency-Key support for POST endpoint
- New endpoint: `PATCH /files/{file_id}/intent` - Update file usage intent
- Structured logging with user_id and project_id context
- Unified response format using `success_response()`
- Proper error handling with `APIException`

**Updated Endpoints:**
- `POST /files` - Now requires authentication, project_id, supports idempotency

### 3. `backend/routers/generate.py`

**Completely Refactored:**
- Changed from generic AI generation to courseware generation
- New endpoint: `POST /generate/courseware` - Generate courseware (PPT/Word)
- New endpoint: `GET /generate/status/{task_id}` - Check generation status
- Authentication dependency on all endpoints
- Idempotency-Key support for POST endpoint
- Request/response models aligned with OpenAPI spec
- Structured logging with user_id and project_id context
- Unified response format using `success_response()`
- Proper error handling with `APIException`

## Common Improvements Across All Routers

1. **Authentication**: All endpoints now require JWT authentication via `get_current_user` dependency
2. **Authorization**: Added TODO comments for permission checks (verify project ownership)
3. **Idempotency**: Write operations support Idempotency-Key header
4. **Logging**: Structured JSON logging with user_id and resource context
5. **Error Handling**: Consistent error handling using `APIException` and standard error responses
6. **Response Format**: All responses use `success_response()` helper for consistency
7. **API Versioning**: All routes properly prefixed with `/api/v1` via main.py

## TODO Items (Marked in Code)

All routers have TODO comments for:
- Idempotency key checking and caching
- Project ownership verification
- Database operations (currently returning mock responses)
- Actual business logic implementation

## Testing

- Python syntax validation passed
- Import validation passed
- FastAPI app loads successfully
- All routes registered correctly under `/api/v1`

## Next Steps

1. Implement database operations in `db_service`
2. Implement idempotency checking mechanism
3. Add permission checking logic
4. Replace mock responses with actual data
5. Add unit tests for each endpoint
6. Add integration tests for authentication flow
