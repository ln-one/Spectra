from scripts.postgres_shadow_stack_audit import evaluate_shadow_stack


def test_shadow_stack_flags_missing_requirements():
    messages, failures = evaluate_shadow_stack("services:\n  backend:\n")

    assert failures > 0
    assert any("FAIL postgres service declared" in message for message in messages)
    assert any("FAIL worker override declared" in message for message in messages)


def test_shadow_stack_accepts_expected_override_shape():
    compose_text = """
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - \"127.0.0.1:5432:5432\"
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U spectra -d spectra_shadow\"]
  backend:
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra_shadow
  worker:
    environment:
      DATABASE_URL: postgresql://spectra:spectra@postgres:5432/spectra_shadow
volumes:
  postgres_shadow_data:
"""

    messages, failures = evaluate_shadow_stack(compose_text)

    assert failures == 0
    assert any("PASS postgres service declared" in message for message in messages)
    assert any(
        "PASS backend DATABASE_URL points to postgres shadow" in message
        for message in messages
    )
    assert any(
        "PASS worker DATABASE_URL points to postgres shadow" in message
        for message in messages
    )
