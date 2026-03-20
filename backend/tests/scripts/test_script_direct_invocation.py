from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _run_script(path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(path), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_postgres_readiness_audit_runs_directly() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_readiness_audit.py",
    )

    assert result.returncode == 0
    assert "PostgreSQL Readiness Audit" in result.stdout


def test_postgres_cutover_rehearsal_runs_directly_without_shadow_smoke() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_cutover_rehearsal.py",
    )

    assert result.returncode == 1
    assert "PostgreSQL cutover rehearsal" in result.stdout
    assert "[shadow-smoke] WARN live shadow smoke skipped" in result.stdout


def test_postgres_shadow_stack_runtime_runs_directly() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_shadow_stack_runtime.py",
    )

    assert result.returncode == 0
    assert "PostgreSQL shadow stack runtime" in result.stdout
    assert "Dry run only" in result.stdout


def test_postgres_baseline_promotion_audit_runs_directly() -> None:
    baseline_root = ROOT / "backend/prisma/postgres-baseline-package"
    if baseline_root.exists():
        result = _run_script(
            ROOT / "backend/scripts/postgres_baseline_promotion_audit.py",
        )
        assert result.returncode == 0
    else:
        result = _run_script(
            ROOT / "backend/scripts/postgres_baseline_promotion_audit.py",
        )
        assert result.returncode == 1

    assert "PostgreSQL baseline promotion audit" in result.stdout


def test_postgres_live_baseline_adopt_runs_directly() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_live_baseline_adopt.py",
    )

    assert result.returncode == 0
    assert "PostgreSQL live baseline adoption" in result.stdout
    assert "Dry run only" in result.stdout


def test_postgres_live_baseline_adoption_audit_runs_directly() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_live_baseline_adoption_audit.py",
    )

    baseline_root = ROOT / "backend/prisma/postgres-live-baseline-candidate"
    if baseline_root.exists():
        assert result.returncode == 0
    else:
        assert result.returncode == 1

    assert "PostgreSQL live baseline adoption audit" in result.stdout


def test_postgres_live_baseline_candidate_runs_directly() -> None:
    result = _run_script(
        ROOT / "backend/scripts/postgres_live_baseline_candidate.py",
    )

    assert result.returncode == 0
    assert "PostgreSQL live baseline candidate" in result.stdout
    assert "Dry run only" in result.stdout
