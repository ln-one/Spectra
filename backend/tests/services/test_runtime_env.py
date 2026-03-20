from __future__ import annotations

from services import runtime_env


def test_normalize_database_url_rewrites_compose_host_for_host_runtime() -> None:
    rewritten = runtime_env.normalize_database_url(
        "postgresql://spectra:spectra@postgres:5432/spectra",
        inside_container=False,
    )
    assert rewritten == "postgresql://spectra:spectra@127.0.0.1:5432/spectra"


def test_normalize_database_url_keeps_container_host_inside_container() -> None:
    rewritten = runtime_env.normalize_database_url(
        "postgresql://spectra:spectra@postgres:5432/spectra",
        inside_container=True,
    )
    assert rewritten == "postgresql://spectra:spectra@postgres:5432/spectra"
