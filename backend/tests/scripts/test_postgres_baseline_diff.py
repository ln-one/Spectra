from subprocess import CompletedProcess

from scripts.postgres_baseline_diff import (
    build_baseline_diff_command,
    evaluate_baseline_diff_readiness,
    render_baseline_diff,
)


def test_baseline_diff_readiness_requires_prisma_cli():
    messages, failures = evaluate_baseline_diff_readiness(
        {},
        which=lambda name: None,
    )

    assert failures == 1
    assert any("prisma CLI is required" in message for message in messages)


def test_build_baseline_diff_command_targets_schema_variant(tmp_path):
    command = build_baseline_diff_command(
        schema_output=tmp_path / "schema.postgres.prisma",
        prisma_bin="custom-prisma",
    )

    assert command == [
        "custom-prisma",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema-datamodel",
        str(tmp_path / "schema.postgres.prisma"),
        "--script",
    ]


def test_render_baseline_diff_writes_output(tmp_path):
    calls: list[list[str]] = []

    def fake_run(command, cwd, env):
        calls.append(list(command))
        return CompletedProcess(command, 0, stdout="-- baseline sql\n", stderr="")

    output_path = tmp_path / "postgres-baseline.sql"
    messages, exit_code = render_baseline_diff(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow-db"},
        schema_output=tmp_path / "schema.postgres.prisma",
        output_path=output_path,
        run_command=fake_run,
    )

    assert exit_code == 0
    assert output_path.read_text(encoding="utf-8") == "-- baseline sql\n"
    assert calls and calls[0][:4] == ["prisma", "migrate", "diff", "--from-empty"]
    assert any("wrote PostgreSQL baseline SQL" in message for message in messages)
