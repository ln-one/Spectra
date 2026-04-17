from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/compose-smart.sh"
PYTHON_SCRIPT = ROOT / "scripts/compose_smart.py"


def _make_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _lock_payload(
    *,
    channel: str,
    pagevra_digest: str | None,
    dualweave_digest: str | None,
    ourograph_digest: str | None,
    stratumind_digest: str | None,
    diego_digest: str | None,
    limora_digest: str | None,
) -> str:
    return json.dumps(
        {
            "channel": channel,
            "services": {
                "pagevra": {
                    "image": "ghcr.io/example/pagevra",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": pagevra_digest,
                    "source_branch": channel,
                    "published": pagevra_digest is not None,
                    "notes": "pagevra lock",
                },
                "dualweave": {
                    "image": "ghcr.io/example/dualweave",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": dualweave_digest,
                    "source_branch": channel,
                    "published": dualweave_digest is not None,
                    "notes": "dualweave lock",
                },
                "ourograph": {
                    "image": "ghcr.io/example/ourograph",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": ourograph_digest,
                    "source_branch": channel,
                    "published": ourograph_digest is not None,
                    "notes": "ourograph lock",
                },
                "stratumind": {
                    "image": "ghcr.io/example/stratumind",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": stratumind_digest,
                    "source_branch": channel,
                    "published": stratumind_digest is not None,
                    "notes": "stratumind lock",
                },
                "diego": {
                    "image": "ghcr.io/example/diego",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": diego_digest,
                    "source_branch": channel,
                    "published": diego_digest is not None,
                    "notes": "diego lock",
                },
                "limora": {
                    "image": "ghcr.io/example/limora",
                    "tag": "dev" if channel == "develop" else "latest",
                    "digest": limora_digest,
                    "source_branch": channel,
                    "published": limora_digest is not None,
                    "notes": "limora lock",
                },
            },
        },
        indent=2,
    )


def _run_compose_smart(
    tmp_path: Path,
    *,
    pagevra: bool,
    dualweave: bool,
    ourograph: bool,
    stratumind: bool,
    diego: bool,
    limora: bool,
    args: list[str],
    develop_lock: tuple[
        str | None, str | None, str | None, str | None, str | None, str | None
    ] = (
        "sha256:" + "1" * 64,
        "sha256:" + "2" * 64,
        "sha256:" + "3" * 64,
        "sha256:" + "4" * 64,
        "sha256:" + "5" * 64,
        "sha256:" + "b" * 64,
    ),
    main_lock: tuple[
        str | None, str | None, str | None, str | None, str | None, str | None
    ] = (
        "sha256:" + "6" * 64,
        "sha256:" + "7" * 64,
        "sha256:" + "8" * 64,
        "sha256:" + "9" * 64,
        "sha256:" + "a" * 64,
        "sha256:" + "c" * 64,
    ),
) -> subprocess.CompletedProcess[str]:
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCRIPT, root / "scripts/compose-smart.sh")
    shutil.copy2(PYTHON_SCRIPT, root / "scripts/compose_smart.py")

    _make_file(root / "docker-compose.yml", "services: {}\n")
    _make_file(
        root / "docker-compose.pagevra.dev.yml",
        "services:\n"
        "  pagevra:\n"
        "    image: spectra-pagevra:dev\n"
        "    build:\n"
        "      context: ./pagevra\n"
        "\n"
        "volumes:\n"
        "  runtime_data:\n",
    )
    _make_file(
        root / "docker-compose.dualweave.dev.yml",
        "services:\n" "  dualweave:\n" "    build:\n" "      context: ./dualweave\n",
    )
    _make_file(
        root / "docker-compose.ourograph.dev.yml",
        "services:\n" "  ourograph:\n" "    build:\n" "      context: ./ourograph\n",
    )
    _make_file(
        root / "docker-compose.stratumind.dev.yml",
        "services:\n" "  stratumind:\n" "    build:\n" "      context: ./stratumind\n",
    )
    _make_file(
        root / "docker-compose.diego.dev.yml",
        "services:\n" "  diego:\n" "    build:\n" "      context: .\n",
    )
    _make_file(
        root / "docker-compose.limora.dev.yml",
        "services:\n" "  limora:\n" "    build:\n" "      context: ./limora\n",
    )
    _make_file(
        root / "infra/stack-lock.develop.json",
        _lock_payload(
            channel="develop",
            pagevra_digest=develop_lock[0],
            dualweave_digest=develop_lock[1],
            ourograph_digest=develop_lock[2],
            stratumind_digest=develop_lock[3],
            diego_digest=develop_lock[4],
            limora_digest=develop_lock[5],
        ),
    )
    _make_file(
        root / "infra/stack-lock.main.json",
        _lock_payload(
            channel="main",
            pagevra_digest=main_lock[0],
            dualweave_digest=main_lock[1],
            ourograph_digest=main_lock[2],
            stratumind_digest=main_lock[3],
            diego_digest=main_lock[4],
            limora_digest=main_lock[5],
        ),
    )

    docker = root / "bin/docker"
    _make_file(
        docker,
        "#!/usr/bin/env python3\n"
        "from __future__ import annotations\n"
        "import sys\n"
        "args = sys.argv[1:]\n"
        "print('DOCKER', ' '.join(args))\n"
        "sys.exit(0)\n",
    )
    docker.chmod(docker.stat().st_mode | stat.S_IEXEC)

    git = root / "bin/git"
    _make_file(
        git,
        "#!/usr/bin/env python3\n"
        "from __future__ import annotations\n"
        "import os\n"
        "import sys\n"
        "\n"
        "args = sys.argv[1:]\n"
        "if len(args) >= 4 and args[0] == '-C' and args[2:4] == ['branch', '--show-current']:\n"
        "    print(os.environ.get('TEST_BRANCH', 'develop'))\n"
        "    sys.exit(0)\n"
        "if len(args) >= 6 and args[0] == '-C' and args[2:5] == ['submodule', 'status', '--']:\n"
        "    name = args[5]\n"
        "    enabled = os.environ.get(f'TEST_SUBMODULE_{name.upper()}') == '1'\n"
        "    if enabled:\n"
        "        print(f' 72de623a8913e17a770e960c2706366211b0d190 {name} (heads/main)')\n"
        "    sys.exit(0)\n"
        "os.execvp('/usr/bin/git', ['/usr/bin/git', *args])\n",
    )
    git.chmod(git.stat().st_mode | stat.S_IEXEC)

    script = root / "scripts/compose-smart.sh"
    script.chmod(script.stat().st_mode | stat.S_IEXEC)

    if pagevra:
        _make_file(root / "pagevra/package.json", "{}\n")
        _make_file(root / "pagevra/.git", "gitdir: ../.git/modules/pagevra\n")
    if dualweave:
        _make_file(root / "dualweave/go.mod", "module example.com/dualweave\n")
        _make_file(root / "dualweave/.git", "gitdir: ../.git/modules/dualweave\n")
    if ourograph:
        _make_file(root / "ourograph/Dockerfile", "FROM eclipse-temurin:21\n")
        _make_file(root / "ourograph/README.md", "# Ourograph\n")
        _make_file(root / "ourograph/.git", "gitdir: ../.git/modules/ourograph\n")
    if stratumind:
        _make_file(root / "stratumind/Dockerfile", "FROM golang:1.23-alpine\n")
        _make_file(root / "stratumind/README.md", "# Stratumind\n")
        _make_file(root / "stratumind/.git", "gitdir: ../.git/modules/stratumind\n")
    if diego:
        _make_file(root / "diego/Dockerfile", "FROM python:3.11-slim\n")
        _make_file(root / "diego/README.md", "# Diego\n")
        _make_file(root / "diego/.git", "gitdir: ../.git/modules/diego\n")
    if limora:
        _make_file(root / "limora/package.json", '{\n  "name": "limora"\n}\n')
        _make_file(root / "limora/README.md", "# Limora\n")
        _make_file(root / "limora/.git", "gitdir: ../.git/modules/limora\n")

    env = os.environ | {
        "PATH": f"{root / 'bin'}:{os.environ['PATH']}",
        "TEST_SUBMODULE_PAGEVRA": "1" if pagevra else "0",
        "TEST_SUBMODULE_DUALWEAVE": "1" if dualweave else "0",
        "TEST_SUBMODULE_OUROGRAPH": "1" if ourograph else "0",
        "TEST_SUBMODULE_STRATUMIND": "1" if stratumind else "0",
        "TEST_SUBMODULE_DIEGO": "1" if diego else "0",
        "TEST_SUBMODULE_LIMORA": "1" if limora else "0",
        "TEST_BRANCH": "develop",
    }
    return subprocess.run(
        [str(script), *args],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_status_reports_lock_and_source_modes(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=False,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["status"],
    )

    assert result.returncode == 0
    assert "Channel: develop" in result.stdout
    assert "Pagevra: using local source" in result.stdout
    assert "Dualweave: using locked image" in result.stdout
    assert "Ourograph: using local source" in result.stdout
    assert "Stratumind: using local source" in result.stdout
    assert "Diego: using local source" in result.stdout
    assert "Limora: using local source" in result.stdout
    assert "Synced env: missing" in result.stdout


def test_sync_writes_env_and_pulls_only_image_mode_services(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=False,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["sync", "--channel", "develop"],
    )

    env_file = tmp_path / "repo/.env.compose.lock"
    env_mirror = tmp_path / "repo/.env"
    override_file = tmp_path / "repo/docker-compose.override.yml"
    assert result.returncode == 0
    assert "Pulling Dualweave" in result.stdout
    assert "uses local source" in result.stdout
    assert env_file.exists()
    assert env_mirror.exists()
    assert override_file.exists()
    content = env_file.read_text(encoding="utf-8")
    mirror_content = env_mirror.read_text(encoding="utf-8")
    override_content = override_file.read_text(encoding="utf-8")
    assert "COMPOSE_LOCK_CHANNEL=develop" in content
    assert "DUALWEAVE_IMAGE=ghcr.io/example/dualweave@sha256:" in content
    assert "PAGEVRA_IMAGE=ghcr.io/example/pagevra@sha256:" in content
    assert "OUROGRAPH_IMAGE=ghcr.io/example/ourograph@sha256:" in content
    assert "STRATUMIND_IMAGE=ghcr.io/example/stratumind@sha256:" in content
    assert "DIEGO_IMAGE=ghcr.io/example/diego@sha256:" in content
    assert "LIMORA_IMAGE=ghcr.io/example/limora@sha256:" in content
    assert content == mirror_content
    assert "services:" in override_content
    assert "pagevra:" in override_content
    assert "image: spectra-pagevra:dev" in override_content
    assert "ourograph:" in override_content
    assert "stratumind:" in override_content
    assert "diego:" in override_content
    assert "limora:" in override_content
    assert "dualweave:" not in override_content
    assert "volumes:" in override_content


def test_sync_fails_when_image_mode_service_is_unpublished(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
        diego=False,
        limora=False,
        args=["sync", "--channel", "develop"],
        develop_lock=("sha256:" + "1" * 64, None, None, None, None, None),
    )

    combined = result.stdout + result.stderr
    assert result.returncode == 1
    assert "Dualweave lock for channel 'develop' is not published yet" in combined
    assert "Ourograph lock for channel 'develop' is not published yet" in combined
    assert "Stratumind lock for channel 'develop' is not published yet" in combined
    assert "Diego lock for channel 'develop' is not published yet" in combined
    assert "Limora lock for channel 'develop' is not published yet" in combined


def test_sync_allows_unpublished_service_when_local_source_exists(
    tmp_path: Path,
) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["sync", "--channel", "develop"],
        develop_lock=("sha256:" + "1" * 64, None, None, None, None, None),
    )

    env_file = tmp_path / "repo/.env.compose.lock"
    env_mirror = tmp_path / "repo/.env"
    override_file = tmp_path / "repo/docker-compose.override.yml"
    assert result.returncode == 0
    content = env_file.read_text(encoding="utf-8")
    mirror_content = env_mirror.read_text(encoding="utf-8")
    override_content = override_file.read_text(encoding="utf-8")
    assert "DUALWEAVE_IMAGE=ghcr.io/example/dualweave:dev" in content
    assert "OUROGRAPH_IMAGE=ghcr.io/example/ourograph:dev" in content
    assert "STRATUMIND_IMAGE=ghcr.io/example/stratumind:dev" in content
    assert "DIEGO_IMAGE=ghcr.io/example/diego:dev" in content
    assert "LIMORA_IMAGE=ghcr.io/example/limora:dev" in content
    assert content == mirror_content
    assert "dualweave:" in override_content
    assert "ourograph:" in override_content
    assert "stratumind:" in override_content
    assert "diego:" in override_content
    assert "limora:" in override_content


def test_sync_removes_override_when_no_local_sources(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
        diego=False,
        limora=False,
        args=["sync", "--channel", "develop"],
    )

    override_file = tmp_path / "repo/docker-compose.override.yml"
    assert result.returncode == 0
    assert not override_file.exists()
    assert "Removed" in result.stdout


def test_doctor_fails_when_sync_missing_for_image_mode(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
        diego=False,
        limora=False,
        args=["doctor", "--channel", "develop"],
    )

    combined = result.stdout + result.stderr
    assert result.returncode == 1
    assert "missing" in combined.lower()
    assert ".env.compose.lock" in combined


def test_compose_command_uses_synced_env_and_overrides(tmp_path: Path) -> None:
    sync_result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["sync", "--channel", "develop"],
    )
    assert sync_result.returncode == 0

    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["config"],
    )

    assert result.returncode == 0
    assert "--env-file" in result.stdout
    assert "docker-compose.pagevra.dev.yml" in result.stdout
    assert "docker-compose.dualweave.dev.yml" in result.stdout
    assert "docker-compose.ourograph.dev.yml" in result.stdout
    assert "docker-compose.stratumind.dev.yml" in result.stdout
    assert "docker-compose.diego.dev.yml" in result.stdout
    assert "docker-compose.limora.dev.yml" in result.stdout


def test_up_auto_syncs_when_env_lock_is_missing(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
        diego=False,
        limora=False,
        args=["up"],
    )

    env_file = tmp_path / "repo/.env.compose.lock"
    assert result.returncode == 0
    assert env_file.exists()
    assert "Auto-syncing compose environment before docker compose" in result.stdout
    assert "Syncing stack lock for channel 'develop'" in result.stdout
    assert "DOCKER pull ghcr.io/example/pagevra@sha256:" in result.stdout
    assert "DOCKER compose --env-file" in result.stdout
    assert " -f docker-compose.yml up" in result.stdout


def test_up_auto_adds_build_when_local_source_exists(tmp_path: Path) -> None:
    sync_result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["sync", "--channel", "develop"],
    )
    assert sync_result.returncode == 0

    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        diego=True,
        limora=True,
        args=["up"],
    )

    assert result.returncode == 0
    assert "Local source detected; adding '--build'" in result.stdout
    assert "DOCKER compose --env-file" in result.stdout
    assert " -f docker-compose.yml" in result.stdout
    assert "docker-compose.pagevra.dev.yml" in result.stdout
    assert "up --build" in result.stdout


@pytest.mark.skipif(shutil.which("docker") is None, reason="docker is required")
def test_real_compose_config_keeps_ourograph_database_contract_with_dev_override(
    tmp_path: Path,
) -> None:
    root = tmp_path / "repo"
    _make_file(
        root / "docker-compose.yml",
        "services:\n"
        "  postgres:\n"
        "    image: postgres:16-alpine\n"
        "    volumes:\n"
        "      - postgres_data:/var/lib/postgresql/data\n"
        "      - ./docker/postgres/initdb:/docker-entrypoint-initdb.d:ro\n"
        "    healthcheck:\n"
        '      test: ["CMD-SHELL", "pg_isready -U spectra -d spectra"]\n'
        "  ourograph:\n"
        "    image: example/ourograph:dev\n"
        "    environment:\n"
        '      PORT: "8101"\n'
        "      OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph\n"
        "    depends_on:\n"
        "      postgres:\n"
        "        condition: service_healthy\n"
        "    healthcheck:\n"
        '      test: ["CMD", "wget", "-q", "-O-", "http://127.0.0.1:8101/health/ready"]\n'
        "volumes:\n"
        "  postgres_data:\n"
        "  runtime_data:\n",
    )
    _make_file(
        root / "docker-compose.ourograph.dev.yml",
        "services:\n"
        "  ourograph:\n"
        "    image: spectra-ourograph:dev\n"
        "    build:\n"
        "      context: ./ourograph\n"
        "      dockerfile: Dockerfile.dev\n"
        "    healthcheck:\n"
        "      start_period: 180s\n"
        "    volumes:\n"
        "      - ./ourograph:/app\n"
        "      - runtime_data:/var/lib/spectra\n",
    )
    _make_file(root / "ourograph/Dockerfile.dev", "FROM gradle:8.10.2-jdk17\n")
    _make_file(
        root / "docker/postgres/initdb/10-create-ourograph-db.sql", "SELECT 1;\n"
    )

    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(root / "docker-compose.yml"),
            "-f",
            str(root / "docker-compose.ourograph.dev.yml"),
            "config",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert (
        "OUROGRAPH_DATABASE_URL: postgresql://spectra:spectra@postgres:5432/ourograph"
        in result.stdout
    )
    assert 'PORT: "8101"' in result.stdout
    assert "http://127.0.0.1:8101/health/ready" in result.stdout
    assert "/docker-entrypoint-initdb.d" in result.stdout
