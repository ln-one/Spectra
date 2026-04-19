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


def test_normalize_stratumind_base_url_rewrites_compose_host_for_host_runtime() -> None:
    rewritten = runtime_env.normalize_stratumind_base_url(
        "http://stratumind:8110",
        inside_container=False,
    )
    assert rewritten == "http://127.0.0.1:8110"


def test_normalize_stratumind_base_url_prefers_local_override_for_host_runtime() -> None:
    rewritten = runtime_env.normalize_stratumind_base_url(
        "http://stratumind:8110",
        inside_container=False,
        local_override="http://127.0.0.1:18110",
    )
    assert rewritten == "http://127.0.0.1:18110"


def test_normalize_stratumind_base_url_keeps_container_host_inside_container() -> None:
    rewritten = runtime_env.normalize_stratumind_base_url(
        "http://stratumind:8110",
        inside_container=True,
    )
    assert rewritten == "http://stratumind:8110"


def test_normalize_internal_service_base_url_rewrites_known_service_for_host_runtime() -> None:
    rewritten = runtime_env.normalize_internal_service_base_url(
        "http://pagevra:8090",
        service_name="pagevra",
        inside_container=False,
    )
    assert rewritten == "http://127.0.0.1:8090"


def test_normalize_internal_service_base_url_keeps_unknown_host_for_host_runtime() -> None:
    rewritten = runtime_env.normalize_internal_service_base_url(
        "http://pagevra.internal:8090",
        service_name="pagevra",
        inside_container=False,
    )
    assert rewritten == "http://pagevra.internal:8090"
