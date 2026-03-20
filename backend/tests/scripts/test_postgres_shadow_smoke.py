from scripts.postgres_shadow_smoke import evaluate_shadow_smoke


def test_shadow_smoke_accumulates_cutover_and_live_failures():
    def fake_cutover(env, *, prisma_provider, shadow_compose_text):
        return ["PostgreSQL cutover readiness audit", "FAIL shadow broken"], 1

    def fake_smoke(*, base_url, token):
        return [f"Deployment smoke check against {base_url}", "FAIL root-health"], 1

    messages, failures = evaluate_shadow_smoke(
        {},
        base_url="http://localhost:8000",
        token=None,
        prisma_provider="sqlite",
        shadow_compose_text=None,
        cutover_eval=fake_cutover,
        smoke_eval=fake_smoke,
    )

    assert failures == 2
    assert messages[0] == "PostgreSQL shadow smoke against http://localhost:8000"
    assert any("[cutover] FAIL shadow broken" == message for message in messages)
    assert any("[smoke] FAIL root-health" == message for message in messages)


def test_shadow_smoke_can_skip_static_cutover_audit():
    def fake_smoke(*, base_url, token):
        assert token == "demo-token"
        return [f"Deployment smoke check against {base_url}", "PASS root-health"], 0

    messages, failures = evaluate_shadow_smoke(
        {"DATABASE_URL": "postgresql://demo"},
        base_url="http://shadow:8000",
        token="demo-token",
        prisma_provider="postgresql",
        shadow_compose_text="services:\n  postgres:\n",
        include_cutover_audit=False,
        smoke_eval=fake_smoke,
    )

    assert failures == 0
    assert all("[cutover]" not in message for message in messages)
    assert any("[smoke] PASS root-health" == message for message in messages)
