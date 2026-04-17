from scripts.distributed_deploy_audit import evaluate_distributed_readiness


def test_distributed_readiness_flags_missing_compose_and_env():
    messages, failures = evaluate_distributed_readiness(
        {},
        prisma_provider="sqlite",
        base_compose_text=None,
        shadow_compose_text=None,
    )

    assert failures > 0
    assert any("docker-compose.yml missing" in message for message in messages)
    assert any("DATABASE_URL missing" in message for message in messages)
    assert any("POSTGRES_BACKUP_DIR missing" in message for message in messages)


def test_distributed_readiness_accepts_split_stack_inputs():
    env = {
        "DATABASE_URL": "postgresql://spectra:pass@postgres.internal:5432/spectra",
        "JWT_SECRET_KEY": "real-secret",
        "REDIS_HOST": "redis.internal",
        "STRATUMIND_BASE_URL": "http://stratumind.internal:8110",
        "STRATUMIND_TIMEOUT_SECONDS": "15",
        "QDRANT_URL": "http://qdrant.internal:6333",
        "NEXT_PUBLIC_API_URL": "https://api.ln1.fun",
        "SYNC_RAG_INDEXING": "false",
        "UPLOAD_DIR": "/var/lib/spectra/uploads",
        "ARTIFACT_STORAGE_DIR": "/var/lib/spectra/artifacts",
        "GENERATED_DIR": "/var/lib/spectra/generated",
        "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
        "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
        "POSTGRES_BACKUP_RETENTION_DAYS": "14",
        "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        "WORKER_NAME": "worker-a",
        "WORKER_RECOVERY_SCAN": "true",
    }
    base_compose = """
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
      POSTGRES_BACKUP_DIR: /var/lib/spectra/backups
      POSTGRES_RESTORE_STAGING_DIR: /var/lib/spectra/restore-staging
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  worker:
    command: python worker.py
    volumes:
      - runtime_data:/var/lib/spectra
    environment:
      UPLOAD_DIR: /var/lib/spectra/uploads
      ARTIFACT_STORAGE_DIR: /var/lib/spectra/artifacts
      GENERATED_DIR: /var/lib/spectra/generated
      POSTGRES_BACKUP_DIR: /var/lib/spectra/backups
      POSTGRES_RESTORE_STAGING_DIR: /var/lib/spectra/restore-staging
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  ourograph:
    environment:
      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8081/health/ready"]
  redis:
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  stratumind:
    ports:
      - "127.0.0.1:8110:8110"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8110/health/ready"]
  qdrant:
    ports:
      - "127.0.0.1:6333:6333"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:6333/healthz"]
"""
    shadow_compose = """
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra_shadow"]
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
"""

    messages, failures = evaluate_distributed_readiness(
        env,
        prisma_provider="postgresql",
        base_compose_text=base_compose,
        shadow_compose_text=shadow_compose,
    )

    assert failures == 0
    assert any(
        "backend and worker commands are separated" in message for message in messages
    )
    assert any(
        "Prisma datasource is already configured for PostgreSQL" in message
        for message in messages
    )
    assert any(
        "PASS recommended WORKER_NAME configured" in message for message in messages
    )
    assert any(
        "storage] PASS UPLOAD_DIR points to `/var/lib/spectra/uploads`" in message
        for message in messages
    )
    assert any("[runtime]" in message for message in messages)
    assert any(
        "[backup] PASS POSTGRES_BACKUP_DIR points to shared backup path" in message
        for message in messages
    )
    assert any(
        "[backend] PASS recommended POSTGRES_BACKUP_DIR configured" in message
        for message in messages
    )


def test_distributed_readiness_prefers_compose_service_env_over_local_env():
    env = {
        "DATABASE_URL": "postgresql://spectra:pass@localhost:5432/spectra",
        "JWT_SECRET_KEY": "real-secret",
        "REDIS_HOST": "localhost",
        "STRATUMIND_BASE_URL": "http://localhost:8110",
        "QDRANT_URL": "http://localhost:6333",
        "UPLOAD_DIR": "/var/lib/spectra/uploads",
        "ARTIFACT_STORAGE_DIR": "/var/lib/spectra/artifacts",
        "GENERATED_DIR": "/var/lib/spectra/generated",
        "POSTGRES_BACKUP_DIR": "/var/lib/spectra/backups",
        "POSTGRES_RESTORE_STAGING_DIR": "/var/lib/spectra/restore-staging",
        "POSTGRES_BACKUP_RETENTION_DAYS": "14",
        "POSTGRES_BACKUP_PREFIX": "spectra-demo",
        "WORKER_NAME": "worker-a",
        "WORKER_RECOVERY_SCAN": "true",
    }
    base_compose = """
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
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra
      REDIS_HOST: redis
      STRATUMIND_BASE_URL: http://stratumind:8110
      QDRANT_URL: http://qdrant:6333
      UPLOAD_DIR: /var/lib/spectra/uploads
      ARTIFACT_STORAGE_DIR: /var/lib/spectra/artifacts
      GENERATED_DIR: /var/lib/spectra/generated
      POSTGRES_BACKUP_DIR: /var/lib/spectra/backups
      POSTGRES_RESTORE_STAGING_DIR: /var/lib/spectra/restore-staging
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  worker:
    command: python worker.py
    volumes:
      - runtime_data:/var/lib/spectra
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra
      REDIS_HOST: redis
      STRATUMIND_BASE_URL: http://stratumind:8110
      QDRANT_URL: http://qdrant:6333
      UPLOAD_DIR: /var/lib/spectra/uploads
      ARTIFACT_STORAGE_DIR: /var/lib/spectra/artifacts
      GENERATED_DIR: /var/lib/spectra/generated
      POSTGRES_BACKUP_DIR: /var/lib/spectra/backups
      POSTGRES_RESTORE_STAGING_DIR: /var/lib/spectra/restore-staging
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./docker/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  ourograph:
    environment:
      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8081/health/ready"]
  redis:
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  stratumind:
    ports:
      - "127.0.0.1:8110:8110"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8110/health/ready"]
  qdrant:
    ports:
      - "127.0.0.1:6333:6333"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:6333/healthz"]
"""

    messages, failures = evaluate_distributed_readiness(
        env,
        prisma_provider="postgresql",
        base_compose_text=base_compose,
        shadow_compose_text=None,
    )

    assert failures == 0
    assert any(
        "[docker] PASS REDIS_HOST points to distributed host `redis`" in message
        for message in messages
    )
    assert any(
        "[docker] PASS STRATUMIND_BASE_URL host points to distributed host `stratumind`"
        for message in messages
    )
    assert any(
        "[docker] PASS QDRANT_URL host points to distributed host `qdrant`" in message
        for message in messages
    )
    assert not any(
        "[docker] WARN REDIS_HOST still points to local-only host" in message
        for message in messages
    )
    assert not any(
        "[docker] WARN STRATUMIND_BASE_URL host still points to local-only host"
        in message
        for message in messages
    )
