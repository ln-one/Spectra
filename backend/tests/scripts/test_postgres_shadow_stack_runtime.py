from scripts.postgres_shadow_stack_runtime import (
    DEFAULT_DATABASE_URL,
    build_shadow_compose_command,
    execute_shadow_stack_command,
    wait_for_shadow_postgres,
)


def test_build_shadow_compose_command_defaults_to_infra_services() -> None:
    command = build_shadow_compose_command()

    assert command[:6] == [
        "docker",
        "compose",
        "-f",
        command[3],
        "-f",
        command[5],
    ]
    assert command[6:] == ["up", "-d", "postgres", "redis", "qdrant", "stratumind"]


def test_build_shadow_compose_command_can_include_app_services() -> None:
    command = build_shadow_compose_command(with_app=True)

    assert command[-6:] == [
        "postgres",
        "redis",
        "qdrant",
        "stratumind",
        "backend",
        "worker",
    ]


def test_build_shadow_compose_command_supports_down() -> None:
    command = build_shadow_compose_command(action="down")
    assert command[6:8] == ["rm", "-sf"]
    assert command[-4:] == ["postgres", "redis", "qdrant", "stratumind"]


def test_wait_for_shadow_postgres_succeeds_when_port_opens() -> None:
    class _Conn:
        def close(self) -> None:
            return None

    ready = wait_for_shadow_postgres(
        DEFAULT_DATABASE_URL,
        timeout_seconds=0.1,
        interval_seconds=0.01,
        connect=lambda address, timeout: _Conn(),
    )

    assert ready is True


def test_wait_for_shadow_postgres_times_out() -> None:
    def fail_connect(address, timeout):
        raise OSError("still down")

    ready = wait_for_shadow_postgres(
        DEFAULT_DATABASE_URL,
        timeout_seconds=0.03,
        interval_seconds=0.01,
        connect=fail_connect,
    )

    assert ready is False


def test_execute_shadow_stack_command_runs_compose_and_waits() -> None:
    recorded: list[list[str]] = []

    def fake_runner(command):
        recorded.append(list(command))
        return 0

    command, exit_code = execute_shadow_stack_command(
        action="up",
        with_app=False,
        database_url=DEFAULT_DATABASE_URL,
        run_command=fake_runner,
        wait_for_postgres=lambda *args, **kwargs: True,
    )

    assert exit_code == 0
    assert recorded[0] == command


def test_execute_shadow_stack_command_down_skips_wait() -> None:
    recorded: list[list[str]] = []

    def fake_runner(command):
        recorded.append(list(command))
        return 0

    command, exit_code = execute_shadow_stack_command(
        action="down",
        with_app=False,
        database_url=DEFAULT_DATABASE_URL,
        run_command=fake_runner,
    )

    assert exit_code == 0
    assert recorded[0] == command
