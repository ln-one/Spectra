from __future__ import annotations

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


def _run_compose_smart(
    tmp_path: Path, *, pagevra: bool, dualweave: bool
) -> subprocess.CompletedProcess[str]:
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCRIPT, root / "scripts/compose-smart.sh")
    shutil.copy2(PYTHON_SCRIPT, root / "scripts/compose_smart.py")

    _make_file(root / "docker-compose.yml", "services: {}\n")
    _make_file(root / "docker-compose.pagevra.dev.yml", "services: {}\n")
    _make_file(root / "docker-compose.dualweave.dev.yml", "services: {}\n")

    docker = root / "bin/docker"
    _make_file(
        docker,
        "#!/usr/bin/env bash\n" "printf '%s\\n' \"$*\"\n",
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
        "if len(args) >= 6 and args[0] == '-C' and args[2:5] == ['submodule', 'status', '--']:\n"
        "    repo = args[1]\n"
        "    name = args[5]\n"
        "    enabled = os.environ.get(f'TEST_SUBMODULE_{name.upper()}') == '1'\n"
        "    if enabled:\n"
        "        print(f' 72de623a8913e17a770e960c2706366211b0d190 {name} (heads/main)')\n"
        "        sys.exit(0)\n"
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

    env = os.environ | {
        "PATH": f"{root / 'bin'}:{os.environ['PATH']}",
        "TEST_SUBMODULE_PAGEVRA": "1" if pagevra else "0",
        "TEST_SUBMODULE_DUALWEAVE": "1" if dualweave else "0",
    }
    return subprocess.run(
        [str(script), "config"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )


def test_compose_smart_uses_image_only_without_private_source(tmp_path: Path) -> None:
    result = _run_compose_smart(tmp_path, pagevra=False, dualweave=False)

    assert result.returncode == 0
    assert "No local private service source detected" in result.stdout
    assert "compose -f docker-compose.yml config" in result.stdout


def test_compose_smart_adds_pagevra_override_when_only_pagevra_exists(
    tmp_path: Path,
) -> None:
    result = _run_compose_smart(tmp_path, pagevra=True, dualweave=False)

    assert result.returncode == 0
    assert "Detected local Pagevra source" in result.stdout
    assert "Using compose overrides" in result.stdout
    assert "docker-compose.pagevra.dev.yml" in result.stdout
    assert "docker-compose.dualweave.dev.yml" not in result.stdout


def test_compose_smart_adds_dualweave_override_when_only_dualweave_exists(
    tmp_path: Path,
) -> None:
    result = _run_compose_smart(tmp_path, pagevra=False, dualweave=True)

    assert result.returncode == 0
    assert "Detected local Dualweave source" in result.stdout
    assert "Using compose overrides" in result.stdout
    assert "docker-compose.dualweave.dev.yml" in result.stdout
    assert "docker-compose.pagevra.dev.yml" not in result.stdout


def test_compose_smart_adds_both_overrides_when_both_sources_exist(
    tmp_path: Path,
) -> None:
    result = _run_compose_smart(tmp_path, pagevra=True, dualweave=True)

    assert result.returncode == 0
    assert "Detected local Pagevra source" in result.stdout
    assert "Detected local Dualweave source" in result.stdout
    assert (
        "compose -f docker-compose.yml -f docker-compose.pagevra.dev.yml "
        "-f docker-compose.dualweave.dev.yml config"
    ) in result.stdout
