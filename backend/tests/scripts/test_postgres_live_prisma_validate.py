from __future__ import annotations

from pathlib import Path

from scripts import postgres_live_prisma_validate as target


def test_live_prisma_readiness_passes_with_postgres_url(monkeypatch) -> None:
    monkeypatch.setattr(target.shutil, "which", lambda _name: "/usr/bin/prisma")
    messages, failures = target.evaluate_live_prisma_readiness(
        {"DATABASE_URL": "postgresql://spectra:spectra@127.0.0.1:5432/spectra"}
    )
    assert failures == 0
    assert any(
        "DATABASE_URL uses a PostgreSQL-compatible scheme" in m for m in messages
    )


def test_build_live_prisma_commands_uses_main_schema() -> None:
    commands = target.build_live_prisma_commands(schema_path=Path("/tmp/schema.prisma"))
    assert commands == [
        ["prisma", "validate", "--schema=/tmp/schema.prisma"],
        ["prisma", "migrate", "deploy", "--schema=/tmp/schema.prisma"],
        ["prisma", "generate", "--schema=/tmp/schema.prisma"],
    ]


def test_execute_live_prisma_validation_runs_all_commands() -> None:
    recorded: list[tuple[list[str], Path, dict[str, str]]] = []

    def fake_runner(cmd: list[str], cwd: Path, env: dict[str, str]) -> int:
        recorded.append((cmd, cwd, env))
        return 0

    commands, exit_code = target.execute_live_prisma_validation(
        {"DATABASE_URL": "postgresql://spectra:spectra@127.0.0.1:5432/spectra"},
        schema_path=Path("/tmp/schema.prisma"),
        run_command=fake_runner,
    )

    assert exit_code == 0
    assert commands == [
        ["prisma", "validate", "--schema=/tmp/schema.prisma"],
        ["prisma", "migrate", "deploy", "--schema=/tmp/schema.prisma"],
        ["prisma", "generate", "--schema=/tmp/schema.prisma"],
    ]
    assert [entry[0] for entry in recorded] == commands
