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
