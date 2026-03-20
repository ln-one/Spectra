import scripts.postgres_cutover_rehearsal as rehearsal


def test_cutover_rehearsal_aggregates_static_gates():
    messages, failures = rehearsal.evaluate_cutover_rehearsal(
        {},
        base_url=None,
        token=None,
        base_compose_text=None,
        shadow_compose_text=None,
        prisma_provider="sqlite",
        migration_lock_provider="sqlite",
        migration_sql_messages=[
            "PostgreSQL migration SQL audit",
            "WARN sqlite markers",
        ],
        cutover_eval=lambda *args, **kwargs: (
            ["PostgreSQL cutover readiness audit", "FAIL static gate"],
            1,
        ),
        recovery_eval=lambda env: (
            ["PostgreSQL recovery drill", "FAIL recovery gate"],
            1,
        ),
        shadow_prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        shadow_eval=lambda *args, **kwargs: (
            ["PostgreSQL shadow smoke", "PASS smoke"],
            0,
        ),
    )

    assert failures == 2
    assert messages[0] == "PostgreSQL cutover rehearsal"
    assert any("[cutover] FAIL static gate" in message for message in messages)
    assert any("[recovery] FAIL recovery gate" in message for message in messages)
    assert any(
        "[shadow-smoke] WARN live shadow smoke skipped" in message
        for message in messages
    )


def test_cutover_rehearsal_can_include_live_shadow_smoke():
    messages, failures = rehearsal.evaluate_cutover_rehearsal(
        {},
        base_url="http://localhost:8000",
        token="demo-token",
        base_compose_text="services: {}",
        shadow_compose_text="services: {}",
        prisma_provider="postgresql",
        migration_lock_provider="postgresql",
        migration_sql_messages=[
            "PostgreSQL migration SQL audit",
            "PASS no sqlite markers",
        ],
        cutover_eval=lambda *args, **kwargs: (
            ["PostgreSQL cutover readiness audit", "PASS cutover"],
            0,
        ),
        recovery_eval=lambda env: (["PostgreSQL recovery drill", "PASS recovery"], 0),
        shadow_prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        shadow_eval=lambda *args, **kwargs: (
            [
                "PostgreSQL shadow smoke against http://localhost:8000",
                "PASS live smoke",
            ],
            0,
        ),
    )

    assert failures == 0
    assert any("[cutover] PASS cutover" in message for message in messages)
    assert any("[recovery] PASS recovery" in message for message in messages)
    assert any("[shadow-smoke] PASS live smoke" in message for message in messages)


def test_cutover_rehearsal_can_run_end_to_end_shadow_flow():
    messages, failures = rehearsal.evaluate_cutover_rehearsal(
        {},
        base_url="http://localhost:8000",
        token="demo-token",
        run_shadow_flow=True,
        base_compose_text="services: {}",
        shadow_compose_text="services: {}",
        prisma_provider="postgresql",
        migration_lock_provider="postgresql",
        migration_sql_messages=[
            "PostgreSQL migration SQL audit",
            "PASS no sqlite markers",
        ],
        cutover_eval=lambda *args, **kwargs: (
            ["PostgreSQL cutover readiness audit", "PASS cutover"],
            0,
        ),
        recovery_eval=lambda env: (["PostgreSQL recovery drill", "PASS recovery"], 0),
        shadow_prisma_eval=lambda env: (
            ["PostgreSQL shadow Prisma validation readiness", "PASS prisma ready"],
            0,
        ),
        shadow_flow_eval=lambda *args, **kwargs: (
            [
                "PostgreSQL shadow flow",
                "PASS shadow stack is up",
                "PASS validate/db-push/generate completed",
                "PASS shadow stack removed",
            ],
            0,
        ),
        shadow_eval=lambda *args, **kwargs: (
            ["PostgreSQL shadow smoke against http://localhost:8000", "PASS smoke"],
            0,
        ),
    )

    assert failures == 0
    assert any("[shadow-flow] PASS shadow stack is up" in m for m in messages)
    assert any(
        "[shadow-flow] PASS validate/db-push/generate completed" in m for m in messages
    )
