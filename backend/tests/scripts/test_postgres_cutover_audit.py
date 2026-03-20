from scripts.postgres_cutover_audit import evaluate_cutover_readiness

SHADOW_COMPOSE = """
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - \"127.0.0.1:5432:5432\"
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U spectra -d spectra_shadow\"]
  backend:
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra_shadow
    depends_on:
      postgres:
        condition: service_healthy
  worker:
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra_shadow
    depends_on:
      postgres:
        condition: service_healthy
volumes:
  postgres_shadow_data:
"""


def test_cutover_audit_fails_for_local_sqlite_defaults():
    messages, failures = evaluate_cutover_readiness(
        {
            "DATABASE_URL": "file:./dev.db",
            "JWT_SECRET_KEY": "change-me",
        },
        prisma_provider="sqlite",
        base_compose_text=None,
        shadow_compose_text=None,
    )

    assert failures > 0
    assert messages[0] == "PostgreSQL cutover readiness audit"
    assert any(
        "[preflight] FAIL DATABASE_URL is not using PostgreSQL" in m for m in messages
    )
    assert any(
        "[shadow] FAIL postgres shadow compose override missing" in m for m in messages
    )


def test_cutover_audit_passes_with_shadow_stack_and_postgres_env():
    messages, failures = evaluate_cutover_readiness(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "JWT_SECRET_KEY": "real-secret",
            "DEFAULT_MODEL": "qwen-plus",
            "LARGE_MODEL": "qwen-max",
            "SMALL_MODEL": "qwen-turbo",
            "AI_REQUEST_TIMEOUT_SECONDS": "45",
            "REDIS_HOST": "redis.internal",
            "REDIS_PORT": "6379",
            "CHROMA_HOST": "chroma.internal",
            "CHROMA_PORT": "8000",
            "WORKER_NAME": "worker-a",
            "WORKER_RECOVERY_SCAN": "true",
            "NEXT_PUBLIC_API_URL": "https://api.ln1.fun",
            "SYNC_RAG_INDEXING": "false",
            "UPLOAD_DIR": "/var/lib/spectra/uploads",
            "ARTIFACT_STORAGE_DIR": "/var/lib/spectra/artifacts",
            "GENERATED_DIR": "/var/lib/spectra/generated",
        },
        prisma_provider="postgresql",
        base_compose_text="""
services:
  frontend:
    ports:
      - "3000:3000"
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    ports:
      - "8000:8000"
    volumes:
      - runtime_data:/var/lib/spectra
    environment:
      UPLOAD_DIR: /var/lib/spectra/uploads
      ARTIFACT_STORAGE_DIR: /var/lib/spectra/artifacts
      GENERATED_DIR: /var/lib/spectra/generated
    depends_on:
      redis:
        condition: service_healthy
      chromadb:
        condition: service_started
  worker:
    command: python worker.py
    volumes:
      - runtime_data:/var/lib/spectra
    environment:
      UPLOAD_DIR: /var/lib/spectra/uploads
      ARTIFACT_STORAGE_DIR: /var/lib/spectra/artifacts
      GENERATED_DIR: /var/lib/spectra/generated
    depends_on:
      redis:
        condition: service_healthy
      chromadb:
        condition: service_started
  redis:
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  chromadb:
    ports:
      - "127.0.0.1:8001:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
""",
        shadow_compose_text=SHADOW_COMPOSE,
    )

    assert failures == 0
    assert any(
        "[preflight] PASS DATABASE_URL uses PostgreSQL-compatible scheme" in m
        for m in messages
    )
    assert any(
        (
            "[distributed] [docker] PASS Prisma datasource is already "
            "configured for PostgreSQL"
        )
        in m
        for m in messages
    )
    assert any(
        "[distributed] [backend] PASS recommended DEFAULT_MODEL configured" in m
        for m in messages
    )
    assert any(
        "[distributed] [worker] PASS recommended WORKER_NAME configured" in m
        for m in messages
    )
    assert any("[shadow] PASS postgres service declared" in m for m in messages)
