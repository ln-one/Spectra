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
  worker:
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra_shadow
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
        },
        prisma_provider="postgresql",
        shadow_compose_text=SHADOW_COMPOSE,
    )

    assert failures == 0
    assert any(
        "[preflight] PASS DATABASE_URL uses PostgreSQL-compatible scheme" in m
        for m in messages
    )
    assert any(
        "[docker] PASS Prisma datasource is already configured for PostgreSQL" in m
        for m in messages
    )
    assert any(
        "[backend] PASS recommended DEFAULT_MODEL configured" in m for m in messages
    )
    assert any(
        "[worker] PASS recommended WORKER_NAME configured" in m for m in messages
    )
    assert any("[shadow] PASS postgres service declared" in m for m in messages)
