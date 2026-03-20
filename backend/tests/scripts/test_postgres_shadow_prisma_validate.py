from pathlib import Path

from scripts.postgres_shadow_prisma_validate import (
    BACKEND_DIR,
    build_shadow_prisma_commands,
    evaluate_shadow_prisma_readiness,
    execute_shadow_prisma_validation,
)


def test_shadow_prisma_readiness_requires_postgres_url_and_prisma():
    messages, failures = evaluate_shadow_prisma_readiness(
        {"DATABASE_URL": "file:./dev.db"},
        which=lambda _: None,
    )

    assert failures == 2
    assert messages[0] == "PostgreSQL shadow Prisma validation readiness"
    assert any("must point to a PostgreSQL shadow database" in m for m in messages)
    assert any("prisma CLI is required" in m for m in messages)


def test_shadow_prisma_readiness_passes_with_postgres_url_and_prisma():
    messages, failures = evaluate_shadow_prisma_readiness(
        {"DATABASE_URL": "postgresql://spectra:pass@postgres:5432/spectra_shadow"},
        which=lambda binary: f"/usr/bin/{binary}",
    )

    assert failures == 0
    assert any("uses a PostgreSQL-compatible scheme" in m for m in messages)
    assert any("prisma CLI resolved" in m for m in messages)


def test_build_shadow_prisma_commands_uses_schema_output():
    schema_output = Path("/tmp/schema.postgres.prisma")
    commands = build_shadow_prisma_commands(schema_output=schema_output)

    assert commands[0][:2] == [
        "python3",
        str(BACKEND_DIR / "scripts/postgres_schema_variant.py"),
    ]
    assert commands[0][3] == str(schema_output)
    assert commands[0][4:] == ["--url-env-var", "POSTGRES_SHADOW_DATABASE_URL"]
    assert commands[1] == ["prisma", "validate", f"--schema={schema_output}"]
    assert commands[2] == [
        "prisma",
        "db",
        "push",
        f"--schema={schema_output}",
        "--skip-generate",
        "--accept-data-loss",
    ]
    assert commands[3] == ["prisma", "generate", f"--schema={schema_output}"]


def test_execute_shadow_prisma_validation_runs_all_commands_in_backend_dir():
    recorded: list[tuple[list[str], Path, str]] = []

    def fake_runner(command, cwd, env):
        recorded.append((list(command), cwd, env["POSTGRES_SHADOW_DATABASE_URL"]))
        return 0

    commands, exit_code = execute_shadow_prisma_validation(
        {"DATABASE_URL": "postgresql://spectra:pass@postgres:5432/spectra_shadow"},
        schema_output=Path("/tmp/schema.postgres.prisma"),
        run_command=fake_runner,
    )

    assert exit_code == 0
    assert len(recorded) == 4
    assert all(item[1] == BACKEND_DIR for item in recorded)
    assert all(item[2].startswith("postgresql://") for item in recorded)
    assert commands[-1][0] == "prisma"


def test_execute_shadow_prisma_validation_stops_on_failure():
    recorded: list[list[str]] = []

    def fake_runner(command, cwd, env):
        recorded.append(list(command))
        return 2 if command[:2] == ["prisma", "db"] else 0

    _, exit_code = execute_shadow_prisma_validation(
        {"DATABASE_URL": "postgresql://spectra:pass@postgres:5432/spectra_shadow"},
        run_command=fake_runner,
    )

    assert exit_code == 2
    assert len(recorded) == 4
    assert recorded[-1] == ["prisma", "generate", "--schema=prisma/schema.prisma"]
