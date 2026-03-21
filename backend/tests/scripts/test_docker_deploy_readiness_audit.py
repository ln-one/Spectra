from scripts.docker_deploy_readiness_audit import (
    build_effective_env,
    evaluate_docker_readiness,
)


def test_docker_readiness_flags_local_only_defaults():
    messages, failures = evaluate_docker_readiness(
        {
            "DATABASE_URL": "file:./dev.db",
            "REDIS_HOST": "localhost",
            "CHROMA_HOST": "127.0.0.1",
            "NEXT_PUBLIC_API_URL": "http://localhost:8000",
            "CHROMA_PERSIST_DIR": "chroma_data",
            "SYNC_RAG_INDEXING": "true",
        },
        "sqlite",
    )

    assert failures == 0
    assert any("sqlite" in message for message in messages)
    assert any(
        "REDIS_HOST still points to local-only host" in message for message in messages
    )
    assert any(
        "CHROMA_HOST still points to local-only host" in message for message in messages
    )
    assert any(
        "NEXT_PUBLIC_API_URL still points at local backend placeholder" in message
        for message in messages
    )
    assert any("SYNC_RAG_INDEXING is enabled" in message for message in messages)


def test_docker_readiness_accepts_distributed_topology_inputs():
    messages, failures = evaluate_docker_readiness(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
            "REDIS_HOST": "redis.internal",
            "CHROMA_HOST": "chroma.internal",
            "NEXT_PUBLIC_API_URL": "https://api.ln1.fun",
            "CHROMA_PERSIST_DIR": "/var/lib/chroma",
            "SYNC_RAG_INDEXING": "false",
        },
        "postgresql",
    )

    assert failures == 0
    assert any("configured for PostgreSQL" in message for message in messages)
    assert any(
        "DATABASE_URL host points to distributed host" in message
        for message in messages
    )
    assert any(
        "REDIS_HOST points to distributed host" in message for message in messages
    )
    assert any(
        "CHROMA_HOST points to distributed host" in message for message in messages
    )
    assert any(
        "NEXT_PUBLIC_API_URL is set for non-local deployment" in message
        for message in messages
    )
    assert any("SYNC_RAG_INDEXING is async-friendly" in message for message in messages)


def test_build_effective_env_prefers_backend_service_env_from_compose():
    base_env = {
        "REDIS_HOST": "localhost",
        "CHROMA_HOST": "localhost",
        "DATABASE_URL": "postgresql://spectra:pass@localhost:5432/spectra",
    }
    compose = """
services:
  backend:
    environment:
      REDIS_HOST: redis
      CHROMA_HOST: chromadb
      DATABASE_URL: postgresql://spectra:pass@postgres:5432/spectra
"""

    merged = build_effective_env(base_env, compose)

    assert merged["REDIS_HOST"] == "redis"
    assert merged["CHROMA_HOST"] == "chromadb"
    assert merged["DATABASE_URL"] == "postgresql://spectra:pass@postgres:5432/spectra"


def test_docker_readiness_warns_on_backend_worker_env_drift():
    compose = """
services:
  backend:
    environment:
      REDIS_HOST: redis
      CHROMA_HOST: chromadb
      GENERATED_DIR: /var/lib/spectra/generated
  worker:
    environment:
      REDIS_HOST: redis-worker
      CHROMA_HOST: chromadb
      GENERATED_DIR: /var/lib/spectra/generated-worker
"""
    messages, failures = evaluate_docker_readiness(
        {
            "DATABASE_URL": "postgresql://spectra:pass@postgres:5432/spectra",
            "REDIS_HOST": "redis",
            "CHROMA_HOST": "chromadb",
        },
        "postgresql",
        compose,
    )

    assert failures == 0
    assert any(
        "backend/worker env drift detected: `REDIS_HOST` differs" in message
        for message in messages
    )
    assert any(
        "backend/worker env drift detected: `GENERATED_DIR` differs" in message
        for message in messages
    )
