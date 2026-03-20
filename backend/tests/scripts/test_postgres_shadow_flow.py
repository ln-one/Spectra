import scripts.postgres_shadow_flow as flow


def test_shadow_flow_runs_stack_prisma_and_teardown() -> None:
    calls: list[tuple[str, bool]] = []

    def fake_stack_runtime(*, action, with_app, database_url, timeout_seconds):
        calls.append((action, with_app))
        if action == "up":
            return (["docker", "compose", "up"], 0)
        return (["docker", "compose", "rm"], 0)

    messages, failures = flow.evaluate_shadow_flow(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow"},
        with_app=False,
        base_url=None,
        token=None,
        include_live_smoke=False,
        stack_runtime=fake_stack_runtime,
        prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        prisma_execute=lambda env: ([[]], 0),
        smoke_eval=lambda *args, **kwargs: (
            ["PostgreSQL shadow smoke", "PASS live smoke"],
            0,
        ),
        teardown_stack=True,
    )

    assert failures == 0
    assert calls == [("up", False), ("down", False)]
    assert any(
        "[shadow-prisma] PASS validate/db-push/generate completed" in m
        for m in messages
    )
    assert any("[teardown] PASS shadow stack removed" in m for m in messages)


def test_shadow_flow_can_run_live_smoke_with_app() -> None:
    smoke_called = False

    def fake_smoke(*args, **kwargs):
        nonlocal smoke_called
        smoke_called = True
        return (["PostgreSQL shadow smoke", "PASS live smoke"], 0)

    messages, failures = flow.evaluate_shadow_flow(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow"},
        with_app=True,
        base_url="http://localhost:8000",
        token="demo",
        include_live_smoke=True,
        stack_runtime=lambda **kwargs: (["docker", "compose"], 0),
        prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        prisma_execute=lambda env: ([[]], 0),
        smoke_eval=fake_smoke,
        teardown_stack=False,
    )

    assert failures == 0
    assert smoke_called is True
    assert any("[shadow-smoke] PASS live smoke" in m for m in messages)
    assert any("[teardown] WARN shadow stack kept running" in m for m in messages)


def test_shadow_flow_skips_live_smoke_after_failure() -> None:
    messages, failures = flow.evaluate_shadow_flow(
        {"POSTGRES_SHADOW_DATABASE_URL": "postgresql://shadow"},
        with_app=True,
        base_url="http://localhost:8000",
        token=None,
        include_live_smoke=True,
        stack_runtime=lambda **kwargs: (["docker", "compose"], 0),
        prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        prisma_execute=lambda env: ([[]], 7),
        smoke_eval=lambda *args, **kwargs: (
            ["PostgreSQL shadow smoke", "PASS live smoke"],
            0,
        ),
        teardown_stack=True,
    )

    assert failures == 1
    assert any(
        "[shadow-prisma] FAIL validate/db-push/generate exited with code 7" in m
        for m in messages
    )
    assert any(
        "[shadow-smoke] WARN live smoke skipped because earlier steps failed" in m
        for m in messages
    )
