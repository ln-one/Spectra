from scripts.postgres_live_stack_flow import (
    DEFAULT_BASE_URL,
    DEFAULT_LIVE_DATABASE_URL,
    build_live_stack_compose_command,
    evaluate_live_stack_flow,
)


def test_build_live_stack_compose_command_defaults_to_full_stack() -> None:
    command = build_live_stack_compose_command(action="up")
    assert command[:4] == ["docker", "compose", "-f", str(command[3])]
    assert command[-5:] == ["postgres", "redis", "chromadb", "backend", "worker"]


def test_build_live_stack_compose_command_supports_down() -> None:
    command = build_live_stack_compose_command(action="down")
    assert command[-7:] == [
        "rm",
        "-sf",
        "postgres",
        "redis",
        "chromadb",
        "backend",
        "worker",
    ]


def test_live_stack_flow_runs_health_smoke_and_teardown() -> None:
    recorded: list[list[str]] = []

    def fake_runner(command: list[str]) -> int:
        recorded.append(command)
        return 0

    def fake_wait(base_url: str, *, timeout_seconds: float) -> bool:
        assert base_url == DEFAULT_BASE_URL
        assert timeout_seconds == 45.0
        return True

    def fake_smoke(*, base_url: str, token: str | None):
        assert base_url == DEFAULT_BASE_URL
        assert token == "demo-token"
        return ["Deployment smoke check", "PASS root-health: HTTP 200"], 0

    messages, failures = evaluate_live_stack_flow(
        base_url=DEFAULT_BASE_URL,
        token="demo-token",
        include_smoke=True,
        teardown_stack=True,
        timeout_seconds=45.0,
        run_command=fake_runner,
        wait_for_backend=fake_wait,
        run_smoke_checks=fake_smoke,
    )

    assert failures == 0
    assert len(recorded) == 2
    assert any("PASS backend became healthy" in m for m in messages)
    assert any(
        "[live-prisma] WARN live Prisma validation skipped" in m for m in messages
    )
    assert any("[smoke] PASS root-health: HTTP 200" in m for m in messages)
    assert any("[teardown] PASS live stack removed" in m for m in messages)


def test_live_stack_flow_runs_live_prisma_before_smoke() -> None:
    recorded: list[list[str]] = []
    prisma_recorded: list[dict[str, str]] = []

    def fake_runner(command: list[str]) -> int:
        recorded.append(command)
        return 0

    def fake_live_prisma_eval(env: dict[str, str]):
        prisma_recorded.append(env)
        return ["PostgreSQL live Prisma validation readiness", "PASS ready"], 0

    def fake_live_prisma_execute(env: dict[str, str]):
        prisma_recorded.append(env)
        return [["prisma", "migrate", "deploy"]], 0

    from scripts import postgres_live_stack_flow as module

    original_execute = module.live_prisma.execute_live_prisma_validation
    module.live_prisma.execute_live_prisma_validation = fake_live_prisma_execute
    try:
        messages, failures = evaluate_live_stack_flow(
            base_url=DEFAULT_BASE_URL,
            token="demo-token",
            include_smoke=True,
            run_live_prisma=True,
            teardown_stack=True,
            timeout_seconds=45.0,
            run_command=fake_runner,
            wait_for_backend=lambda *_args, **_kwargs: True,
            run_smoke_checks=lambda **_kwargs: (
                ["Deployment smoke check", "PASS root-health: HTTP 200"],
                0,
            ),
            live_prisma_eval=fake_live_prisma_eval,
        )
    finally:
        module.live_prisma.execute_live_prisma_validation = original_execute

    assert failures == 0
    assert len(prisma_recorded) == 2
    assert all(
        env["DATABASE_URL"] == DEFAULT_LIVE_DATABASE_URL for env in prisma_recorded
    )
    assert any(
        "[live-prisma] PASS validate/migrate-deploy/generate completed" in m
        for m in messages
    )


def test_live_stack_flow_skips_smoke_when_live_prisma_readiness_fails() -> None:
    recorded: list[list[str]] = []

    def fake_runner(command: list[str]) -> int:
        recorded.append(command)
        return 0

    messages, failures = evaluate_live_stack_flow(
        base_url=DEFAULT_BASE_URL,
        token="demo-token",
        include_smoke=True,
        run_live_prisma=True,
        teardown_stack=True,
        timeout_seconds=45.0,
        run_command=fake_runner,
        wait_for_backend=lambda *_args, **_kwargs: True,
        live_prisma_eval=lambda _env: (
            ["PostgreSQL live Prisma validation readiness", "FAIL not ready"],
            1,
        ),
    )

    assert failures == 1
    assert any(
        "[live-prisma] WARN execution skipped because readiness checks failed" in m
        for m in messages
    )
    assert any(
        "[smoke] WARN smoke skipped because startup checks failed" in m
        for m in messages
    )


def test_live_stack_flow_fails_when_backend_never_becomes_healthy() -> None:
    recorded: list[list[str]] = []

    def fake_runner(command: list[str]) -> int:
        recorded.append(command)
        return 0

    messages, failures = evaluate_live_stack_flow(
        base_url=DEFAULT_BASE_URL,
        token=None,
        include_smoke=True,
        run_command=fake_runner,
        wait_for_backend=lambda *_args, **_kwargs: False,
    )

    assert failures == 1
    assert len(recorded) == 2
    assert any("FAIL backend did not become healthy" in m for m in messages)
    assert any(
        "[smoke] WARN smoke skipped because startup checks failed" in m
        for m in messages
    )
