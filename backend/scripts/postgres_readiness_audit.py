#!/usr/bin/env python3
"""Static PostgreSQL readiness audit for Spectra."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from scripts.postgres_migration_sql_audit import evaluate_migration_sql

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "backend/prisma/schema.prisma"
MIGRATION_LOCK = ROOT / "backend/prisma/migrations/migration_lock.toml"

TARGET_MODELS = {
    "Project",
    "GenerationSession",
    "GenerationTask",
    "Conversation",
    "Upload",
    "ParsedChunk",
    "Artifact",
    "ProjectVersion",
    "ProjectReference",
    "CandidateChange",
    "IdempotencyKey",
}

HOTSPOT_PATTERNS = {
    "idempotency": [
        ROOT / "backend/services/database/files.py",
        ROOT / "backend/services/database/projects.py",
        ROOT / "backend/services/project_space_service/member_api.py",
    ],
    "project_space_review": [
        ROOT / "backend/services/project_space_service/review.py",
        ROOT / "backend/services/database/project_space_changes.py",
        ROOT / "backend/services/database/project_space_references.py",
    ],
    "generation_session": [
        ROOT / "backend/services/generation_session_service/task_dispatch.py",
        ROOT / "backend/services/generation_session_service/outline_draft/execution.py",
        ROOT / "backend/services/generation_session_service/command_execution.py",
    ],
}

FIELD_RE = re.compile(r"^\s*(\w+)\s+(\w+)(.*)$")
MODEL_RE = re.compile(r"^model\s+(\w+)\s+\{")
PROVIDER_RE = re.compile(r'provider\s*=\s*"([^"]+)"')


@dataclass
class ModelRisk:
    name: str
    field_count: int = 0
    json_like_fields: int = 0
    unique_fields: int = 0
    relation_fields: int = 0
    created_updated_fields: int = 0


@dataclass
class HotspotRisk:
    name: str
    composite_operations: int = 0
    json_operations: int = 0
    upserts: int = 0
    ordered_reads: int = 0


def parse_schema() -> tuple[str | None, dict[str, ModelRisk]]:
    provider = None
    models: dict[str, ModelRisk] = {}
    current: ModelRisk | None = None
    in_datasource = False

    for raw_line in SCHEMA.read_text().splitlines():
        line = raw_line.strip()
        if line.startswith("datasource db"):
            in_datasource = True
            continue
        if in_datasource and line == "}":
            in_datasource = False
            continue
        if in_datasource:
            match = PROVIDER_RE.search(line)
            if match:
                provider = match.group(1)
            continue

        model_match = MODEL_RE.match(line)
        if model_match:
            name = model_match.group(1)
            current = ModelRisk(name=name)
            models[name] = current
            continue
        if current and line == "}":
            current = None
            continue
        if not current or not line or line.startswith("//") or line.startswith("@@"):
            continue

        field_match = FIELD_RE.match(raw_line)
        if not field_match:
            continue
        _, field_type, suffix = field_match.groups()
        current.field_count += 1
        if field_type == "String" and "JSON" in raw_line:
            current.json_like_fields += 1
        if "@unique" in suffix:
            current.unique_fields += 1
        if "@relation" in suffix or field_type.endswith("[]"):
            current.relation_fields += 1
        if "@default(now())" in suffix or "@updatedAt" in suffix:
            current.created_updated_fields += 1

    return provider, {k: v for k, v in models.items() if k in TARGET_MODELS}


def parse_migration_lock_provider() -> str | None:
    if not MIGRATION_LOCK.exists():
        return None

    for raw_line in MIGRATION_LOCK.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        match = PROVIDER_RE.search(line)
        if match:
            return match.group(1)
    return None


def analyze_hotspots() -> dict[str, HotspotRisk]:
    counts: dict[str, HotspotRisk] = {}
    for name, files in HOTSPOT_PATTERNS.items():
        risk = HotspotRisk(name=name)
        for path in files:
            text = path.read_text(encoding="utf-8")
            risk.composite_operations += (
                text.count("find_")
                + text.count("create(")
                + text.count("update(")
                + text.count("delete(")
            )
            risk.json_operations += text.count("json.dumps") + text.count("json.loads")
            risk.upserts += text.count("upsert(")
            risk.ordered_reads += text.count('order={"') + text.count("order={")
        counts[name] = risk
    return counts


def main() -> None:
    provider, models = parse_schema()
    migration_lock_provider = parse_migration_lock_provider()
    hotspots = analyze_hotspots()
    migration_sql_messages, _ = evaluate_migration_sql()

    print("PostgreSQL Readiness Audit")
    print(f"- Root: {ROOT}")
    print(f"- Prisma schema: {SCHEMA}")
    print(f"- Datasource provider: {provider or 'unknown'}")
    print(f"- Migration lock provider: {migration_lock_provider or 'missing/unknown'}")
    print()

    if provider == "sqlite":
        print(
            "[warning] Prisma datasource is still sqlite; "
            "PostgreSQL migration remains pending."
        )
    elif provider == "postgresql":
        print("[ok] Prisma datasource already points at postgresql.")
    else:
        print("[warning] Prisma datasource provider could not be classified.")

    if migration_lock_provider == "sqlite":
        print(
            "[warning] Prisma migration lock is still sqlite; "
            "a PostgreSQL baseline migration path still needs to be created."
        )
    elif migration_lock_provider == "postgresql":
        print("[ok] Prisma migration lock already points at postgresql.")
    else:
        print("[warning] Prisma migration lock provider could not be classified.")
    print()

    print("Model Risk Snapshot")
    for name in sorted(models):
        risk = models[name]
        print(
            f"- {name}: fields={risk.field_count}, json_like={risk.json_like_fields}, "
            f"unique={risk.unique_fields}, relations={risk.relation_fields}, "
            f"timestamps={risk.created_updated_fields}"
        )
    print()

    print("Consistency Hotspots")
    for name in sorted(hotspots):
        risk = hotspots[name]
        print(
            f"- {name}: composite_db_ops={risk.composite_operations}, "
            f"json_ops={risk.json_operations}, upserts={risk.upserts}, "
            f"ordered_reads={risk.ordered_reads}"
        )
    print()

    print("Migration SQL Compatibility")
    for message in migration_sql_messages[1:]:
        print(f"- {message}")
    print()

    print("Next Checks")
    print(
        "- Verify idempotency uniqueness and expiry strategy before PostgreSQL cutover."
    )
    print(
        "- Re-check project-space review/version writes for transactional consistency."
    )
    print(
        "- Re-run main backend suite against PostgreSQL shadow environment "
        "before switching main."
    )
    print(
        "- Prepare a PostgreSQL Prisma migration baseline before changing the "
        "main datasource provider."
    )


if __name__ == "__main__":
    main()
