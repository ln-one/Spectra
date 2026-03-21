from scripts.deploy_smoke_pipeline import build_pipeline_commands


def test_build_pipeline_commands_without_token():
    commands = build_pipeline_commands(
        skip_network_preflight=True,
        base_url="http://localhost:8000",
        token=None,
    )
    assert commands[0] == [
        "python3",
        "backend/scripts/deploy_preflight.py",
        "--skip-network",
    ]
    assert commands[-1] == [
        "python3",
        "backend/scripts/deploy_smoke_check.py",
        "--base-url",
        "http://localhost:8000",
    ]


def test_build_pipeline_commands_with_token():
    commands = build_pipeline_commands(
        skip_network_preflight=False,
        base_url="https://api.example.com",
        token="bearer-token",
    )
    assert commands[0] == ["python3", "backend/scripts/deploy_preflight.py"]
    assert commands[-1] == [
        "python3",
        "backend/scripts/deploy_smoke_check.py",
        "--base-url",
        "https://api.example.com",
        "--token",
        "bearer-token",
    ]
