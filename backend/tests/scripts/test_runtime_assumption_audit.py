import scripts.runtime_assumption_audit as audit
from scripts.runtime_assumption_audit import AssumptionPattern, _find_hits


def test_find_hits_detects_matching_line(tmp_path):
    target = tmp_path / "demo.py"
    target.write_text('DATABASE_URL = "file:./dev.db"\n', encoding="utf-8")

    hits = _find_hits(
        AssumptionPattern(
            name="sqlite_default",
            needle="file:./dev.db",
            scope=(tmp_path,),
        )
    )

    assert len(hits) == 1
    assert "file:./dev.db" in hits[0]


def test_find_hits_returns_empty_when_absent(tmp_path):
    target = tmp_path / "demo.py"
    target.write_text('DATABASE_URL = "postgresql://demo"\n', encoding="utf-8")

    hits = _find_hits(
        AssumptionPattern(
            name="sqlite_default",
            needle="file:./dev.db",
            scope=(tmp_path,),
        )
    )

    assert hits == []


def test_find_hits_skips_tests_and_virtualenv_paths(tmp_path):
    tests_target = tmp_path / "tests" / "demo.py"
    tests_target.parent.mkdir(parents=True)
    tests_target.write_text('DATABASE_URL = "file:./dev.db"\n', encoding="utf-8")

    venv_target = tmp_path / ".venv" / "demo.py"
    venv_target.parent.mkdir(parents=True)
    venv_target.write_text('DATABASE_URL = "file:./dev.db"\n', encoding="utf-8")

    active_target = tmp_path / "runtime.py"
    active_target.write_text('DATABASE_URL = "file:./dev.db"\n', encoding="utf-8")

    hits = _find_hits(
        AssumptionPattern(
            name="sqlite_default",
            needle="file:./dev.db",
            scope=(tmp_path,),
        )
    )

    assert len(hits) == 1
    assert str(active_target) in hits[0]


def test_find_hits_skips_audit_script_file(monkeypatch, tmp_path):
    script_file = tmp_path / "runtime_assumption_audit.py"
    script_file.write_text('DATABASE_URL = "file:./dev.db"\n', encoding="utf-8")

    monkeypatch.setattr(audit, "SCRIPT_FILE", script_file.resolve())

    hits = _find_hits(
        AssumptionPattern(
            name="sqlite_default",
            needle="file:./dev.db",
            scope=(tmp_path,),
        )
    )

    assert hits == []
