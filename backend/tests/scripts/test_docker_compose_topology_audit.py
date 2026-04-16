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
    assert any("missing `ourograph` service" in message for message in messages)
    assert any(
        "`postgres` must mount `/docker-entrypoint-initdb.d` for Ourograph database bootstrap"
        in message
        for message in messages
    )


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
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  ourograph:
    environment:
      PORT: "8101"
      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8101/health/ready"]
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
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/initdb:/docker-entrypoint-initdb.d:ro
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
    assert any(
        "base compose declares `stratumind` service" in message for message in messages
    )
    assert any(
        "base compose declares `qdrant` service" in message for message in messages
    )
    assert any(
        "shadow `backend` DATABASE_URL points at postgres service" in message
        for message in messages
    )
    assert any(
        "`ourograph` OUROGRAPH_DATABASE_URL points at postgres `ourograph` database"
        in message
        for message in messages
    )
    assert any(
        "`postgres` mounts `/docker-entrypoint-initdb.d` for database bootstrap scripts"
        in message
        for message in messages
    )
    assert any("`ourograph` depends on `postgres`" in message for message in messages)
    assert any(
        "`ourograph` healthcheck targets `/health/ready`" in message
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


def test_compose_topology_rejects_invalid_ourograph_database_contract():
    base_compose = """
services:
  frontend:
    ports:
      - "3000:3000"
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph
    depends_on:
      redis:
        condition: service_healthy
      stratumind:
        condition: service_healthy
  worker:
    command: python worker.py
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra
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
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  ourograph:
    environment:
      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra
    depends_on:
      postgres:
        condition: service_healthy
"""

    messages, failures = evaluate_compose_topology(base_compose, None)

    assert failures > 0
    assert any(
        "backend DATABASE_URL must not point at Ourograph's formal-state database"
        in message
        for message in messages
    )
    assert any(
        "`ourograph` OUROGRAPH_DATABASE_URL must point at postgres `ourograph` database"
        in message
        for message in messages
    )
    assert any(
        "`postgres` must mount `/docker-entrypoint-initdb.d` for Ourograph database bootstrap"
        in message
        for message in messages
    )
    assert any("`ourograph` missing healthcheck" in message for message in messages)


def test_compose_topology_rejects_ourograph_healthcheck_without_ready_path():
    base_compose = """
services:
  frontend:
    ports:
      - "3000:3000"
  backend:
    command: uvicorn main:app --host 0.0.0.0 --port 8000
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
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]
  ourograph:
    environment:
      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8101/health/live"]
"""

    messages, failures = evaluate_compose_topology(base_compose, None)

    assert failures > 0
    assert any(
        "`ourograph` healthcheck must target `/health/ready`" in message
        for message in messages
    )
