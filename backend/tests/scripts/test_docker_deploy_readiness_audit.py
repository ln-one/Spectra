from scripts.docker_deploy_readiness_audit import evaluate_docker_readiness


def test_docker_readiness_flags_local_only_defaults():
    messages, failures = evaluate_docker_readiness(
        {
            "DATABASE_URL": "file:./dev.db",
            "REDIS_HOST": "localhost",
            "CHROMA_HOST": "127.0.0.1",
            "NEXT_PUBLIC_API_URL": "http://localhost:8000",
            "CHROMA_PERSIST_DIR": "./chroma_data",
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
