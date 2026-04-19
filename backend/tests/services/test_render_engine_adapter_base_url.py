from __future__ import annotations

from services import render_engine_adapter


def test_render_engine_base_url_uses_local_override_for_host_runtime(monkeypatch) -> None:
    monkeypatch.setattr(
        render_engine_adapter, "running_inside_container", lambda: False
    )
    monkeypatch.setenv("PAGEVRA_BASE_URL", "http://pagevra:8090")
    monkeypatch.setenv("PAGEVRA_BASE_URL_LOCAL", "http://127.0.0.1:8090")

    assert render_engine_adapter._render_engine_base_url() == "http://127.0.0.1:8090"
