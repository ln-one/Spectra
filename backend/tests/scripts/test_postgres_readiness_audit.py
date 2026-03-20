from scripts.postgres_readiness_audit import (
    analyze_hotspots,
    parse_migration_lock_provider,
    parse_schema,
)


def test_parse_schema_tracks_target_models_and_provider():
    provider, models = parse_schema()

    assert provider in {"sqlite", "postgresql"}
    assert "GenerationSession" in models
    assert "Project" in models
    assert models["GenerationSession"].field_count > 0
    assert models["Project"].relation_fields > 0


def test_parse_migration_lock_provider_tracks_current_baseline():
    provider = parse_migration_lock_provider()

    assert provider in {None, "sqlite", "postgresql"}


def test_analyze_hotspots_returns_structured_risk_counts():
    hotspots = analyze_hotspots()

    assert "idempotency" in hotspots
    assert "project_space_review" in hotspots
    assert "generation_session" in hotspots

    generation_risk = hotspots["generation_session"]
    assert generation_risk.composite_operations > 0
    assert generation_risk.json_operations >= 0
    assert generation_risk.ordered_reads >= 0
