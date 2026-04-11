from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

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
    args: list[str],
    develop_lock: tuple[str | None, str | None, str | None, str | None] = (
        "sha256:" + "1" * 64,
        "sha256:" + "2" * 64,
        "sha256:" + "3" * 64,
        "sha256:" + "4" * 64,
    ),
    main_lock: tuple[str | None, str | None, str | None, str | None] = (
        "sha256:" + "5" * 64,
        "sha256:" + "6" * 64,
        "sha256:" + "7" * 64,
        "sha256:" + "8" * 64,
    ),
) -> subprocess.CompletedProcess[str]:
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCRIPT, root / "scripts/compose-smart.sh")
    shutil.copy2(PYTHON_SCRIPT, root / "scripts/compose_smart.py")

    _make_file(root / "docker-compose.yml", "services: {}\n")
    _make_file(root / "docker-compose.pagevra.dev.yml", "services: {}\n")
    _make_file(root / "docker-compose.dualweave.dev.yml", "services: {}\n")
    _make_file(root / "docker-compose.ourograph.dev.yml", "services: {}\n")
    _make_file(root / "docker-compose.stratumind.dev.yml", "services: {}\n")
    _make_file(
        root / "infra/stack-lock.develop.json",
        _lock_payload(
            channel="develop",
            pagevra_digest=develop_lock[0],
            dualweave_digest=develop_lock[1],
            ourograph_digest=develop_lock[2],
            stratumind_digest=develop_lock[3],
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

    env = os.environ | {
        "PATH": f"{root / 'bin'}:{os.environ['PATH']}",
        "TEST_SUBMODULE_PAGEVRA": "1" if pagevra else "0",
        "TEST_SUBMODULE_DUALWEAVE": "1" if dualweave else "0",
        "TEST_SUBMODULE_OUROGRAPH": "1" if ourograph else "0",
        "TEST_SUBMODULE_STRATUMIND": "1" if stratumind else "0",
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
        args=["status"],
    )

    assert result.returncode == 0
    assert "Channel: develop" in result.stdout
    assert "Pagevra: using local source" in result.stdout
    assert "Dualweave: using locked image" in result.stdout
    assert "Ourograph: using local source" in result.stdout
    assert "Stratumind: using local source" in result.stdout
    assert "Synced env: missing" in result.stdout


def test_sync_writes_env_and_pulls_only_image_mode_services(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=False,
        ourograph=True,
        stratumind=True,
        args=["sync", "--channel", "develop"],
    )

    env_file = tmp_path / "repo/.env.compose.lock"
    env_mirror = tmp_path / "repo/.env"
    assert result.returncode == 0
    assert "Pulling Dualweave" in result.stdout
    assert "uses local source" in result.stdout
    assert env_file.exists()
    assert env_mirror.exists()
    content = env_file.read_text(encoding="utf-8")
    mirror_content = env_mirror.read_text(encoding="utf-8")
    assert "COMPOSE_LOCK_CHANNEL=develop" in content
    assert "DUALWEAVE_IMAGE=ghcr.io/example/dualweave@sha256:" in content
    assert "PAGEVRA_IMAGE=ghcr.io/example/pagevra@sha256:" in content
    assert "OUROGRAPH_IMAGE=ghcr.io/example/ourograph@sha256:" in content
    assert "STRATUMIND_IMAGE=ghcr.io/example/stratumind@sha256:" in content
    assert content == mirror_content


def test_sync_fails_when_image_mode_service_is_unpublished(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
        args=["sync", "--channel", "develop"],
        develop_lock=("sha256:" + "1" * 64, None, None, None),
    )

    combined = result.stdout + result.stderr
    assert result.returncode == 1
    assert "Dualweave lock for channel 'develop' is not published yet" in combined
    assert "Ourograph lock for channel 'develop' is not published yet" in combined
    assert "Stratumind lock for channel 'develop' is not published yet" in combined


def test_sync_allows_unpublished_service_when_local_source_exists(
    tmp_path: Path,
) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        args=["sync", "--channel", "develop"],
        develop_lock=("sha256:" + "1" * 64, None, None, None),
    )

    env_file = tmp_path / "repo/.env.compose.lock"
    env_mirror = tmp_path / "repo/.env"
    assert result.returncode == 0
    content = env_file.read_text(encoding="utf-8")
    mirror_content = env_mirror.read_text(encoding="utf-8")
    assert "DUALWEAVE_IMAGE=ghcr.io/example/dualweave:dev" in content
    assert "OUROGRAPH_IMAGE=ghcr.io/example/ourograph:dev" in content
    assert "STRATUMIND_IMAGE=ghcr.io/example/stratumind:dev" in content
    assert content == mirror_content


def test_doctor_fails_when_sync_missing_for_image_mode(tmp_path: Path) -> None:
    result = _run_compose_smart(
        tmp_path,
        pagevra=False,
        dualweave=False,
        ourograph=False,
        stratumind=False,
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
        args=["sync", "--channel", "develop"],
    )
    assert sync_result.returncode == 0

    result = _run_compose_smart(
        tmp_path,
        pagevra=True,
        dualweave=True,
        ourograph=True,
        stratumind=True,
        args=["config"],
    )

    assert result.returncode == 0
    assert "--env-file" in result.stdout
    assert "docker-compose.pagevra.dev.yml" in result.stdout
    assert "docker-compose.dualweave.dev.yml" in result.stdout
    assert "docker-compose.ourograph.dev.yml" in result.stdout
    assert "docker-compose.stratumind.dev.yml" in result.stdout
