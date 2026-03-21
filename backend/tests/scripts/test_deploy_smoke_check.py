from scripts.deploy_smoke_check import Check, run_smoke_checks


def test_smoke_checks_skip_authenticated_probe_without_token():
    messages, failures = run_smoke_checks(
        base_url="http://api.internal",
        token=None,
        checks=(
            Check("root-health", "/health/ready"),
            Check(
                "generate-capabilities",
                "/api/v1/generate/capabilities",
                requires_auth=True,
            ),
        ),
        run_check=lambda base_url, check, token: (
            (
                True,
                f"PASS {check.name}: simulated",
            )
            if not check.requires_auth
            else (True, f"SKIP {check.name}: requires token")
        ),
    )

    assert failures == 0
    assert messages[0] == "Deployment smoke check against http://api.internal"
    assert any("PASS root-health: simulated" in message for message in messages)
    assert any(
        "SKIP generate-capabilities: requires token" in message for message in messages
    )


def test_smoke_checks_accumulate_failures():
    checks = (
        Check("root-health", "/health/ready"),
        Check("capabilities-health", "/api/v1/health/capabilities"),
    )

    def fake_run_check(base_url: str, check: Check, token: str | None):
        if check.name == "root-health":
            return True, "PASS root-health: HTTP 200"
        return False, "FAIL capabilities-health: HTTP 503"

    messages, failures = run_smoke_checks(
        base_url="http://api.internal",
        token="token",
        checks=checks,
        run_check=fake_run_check,
    )

    assert failures == 1
    assert any("PASS root-health: HTTP 200" in message for message in messages)
    assert any("FAIL capabilities-health: HTTP 503" in message for message in messages)
