from types import SimpleNamespace

from services.generation_session_service.snapshot_runtime_queries import (
    build_snapshot_result,
)


def test_build_snapshot_result_returns_bound_output_even_before_success_state() -> None:
    session = SimpleNamespace(
        state="RENDERING",
        pptUrl="/api/v1/projects/p1/artifacts/a1/download",
        wordUrl=None,
        renderVersion=7,
    )

    result = build_snapshot_result(session)

    assert result is not None
    assert result["ppt_url"] == "/api/v1/projects/p1/artifacts/a1/download"
    assert result["version"] == 7
