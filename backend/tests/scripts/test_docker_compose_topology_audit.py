from scripts.docker_compose_topology_audit import evaluate_compose_topology


def test_compose_topology_flags_missing_structure():
    base_compose = """
services:
  backend:
    command: uvicorn main:app
"""

    messages, failures = evaluate_compose_topology(base_compose, None)

    assert failures > 0
    assert any("missing `frontend` service" in message for message in messages)
    assert any("missing `worker` service" in message for message in messages)
    assert any("stateful service `redis` missing" in message for message in messages)
    assert any("missing `stratumind` service" in message for message in messages)


def test_compose_topology_rejects_duplicate_environment_keys():
    base_compose = """
services:
  frontend:
    ports:
      - "3000:3000"
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    environment:
      - POSTGRES_BACKUP_DIR=/var/lib/spectra/backups
      - POSTGRES_BACKUP_DIR=/var/lib/spectra/backups
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  worker:
    command: python worker.py
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
  stratumind:
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8110/health/ready"]
  qdrant:
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:6333/healthz"]
"""

    messages, failures = evaluate_compose_topology(base_compose, None)

    assert failures > 0
    assert any(
        "backend declares duplicate environment keys" in message for message in messages
    )


def test_compose_topology_accepts_split_runtime_and_shadow_postgres():
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

    messages, failures = evaluate_compose_topology(base_compose, shadow_compose)

    assert failures == 0
    assert any(
        "backend and worker commands are separated" in message for message in messages
    )
    assert any("worker stays internal-only" in message for message in messages)
    assert any("shadow override declares postgres" in message for message in messages)
    assert any("base compose declares `stratumind` service" in message for message in messages)
    assert any("base compose declares `qdrant` service" in message for message in messages)
    assert any(
        "shadow `backend` DATABASE_URL points at postgres service" in message
        for message in messages
    )
    assert any(
        "backend mounts shared runtime storage" in message for message in messages
    )
    assert any(
        "worker configures `GENERATED_DIR` inside shared runtime storage" in message
        for message in messages
    )
    assert any(
        "backend configures `POSTGRES_BACKUP_DIR` inside shared runtime storage"
        in message
        for message in messages
    )
