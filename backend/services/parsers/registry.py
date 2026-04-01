"""Parser provider registry and factory helpers."""

from __future__ import annotations

import logging
import os
from typing import Callable

from .base import BaseParseProvider, ProviderNotAvailableError

logger = logging.getLogger(__name__)

_PROVIDER_FACTORIES: dict[str, Callable[[], BaseParseProvider]] = {}


def _register_builtin_providers() -> None:
    """Register built-in providers via lazy factories."""

    def _make_local() -> BaseParseProvider:
        from .local_provider import LocalProvider

        return LocalProvider()

    def _make_mineru() -> BaseParseProvider:
        from .mineru_provider import MinerUProvider

        return MinerUProvider()

    def _make_llamaparse() -> BaseParseProvider:
        from .llamaparse_provider import LlamaParseProvider

        return LlamaParseProvider()

    def _make_mineru_api() -> BaseParseProvider:
        from .mineru_api_provider import MineruApiProvider

        return MineruApiProvider()

    def _make_mineru_cloud() -> BaseParseProvider:
        from .mineru_cloud_provider import MineruCloudProvider

        return MineruCloudProvider()

    def _make_auto() -> BaseParseProvider:
        return _make_local()

    _PROVIDER_FACTORIES["local"] = _make_local
    _PROVIDER_FACTORIES["mineru"] = _make_mineru
    _PROVIDER_FACTORIES["mineru_api"] = _make_mineru_api
    _PROVIDER_FACTORIES["mineru_cloud"] = _make_mineru_cloud
    _PROVIDER_FACTORIES["llamaparse"] = _make_llamaparse
    _PROVIDER_FACTORIES["auto"] = _make_auto


_register_builtin_providers()


def register_provider(name: str, factory: Callable[[], BaseParseProvider]) -> None:
    """Register a custom provider factory."""
    _PROVIDER_FACTORIES[name] = factory


def get_parser(provider_name: str | None = None) -> BaseParseProvider:
    """Return a parser provider, falling back to local if unavailable."""
    name = provider_name or os.getenv("DOCUMENT_PARSER", "local")

    factory = _PROVIDER_FACTORIES.get(name)
    if factory is None:
        logger.warning("Unknown DOCUMENT_PARSER=%s, falling back to local", name)
        return _PROVIDER_FACTORIES["local"]()

    try:
        return factory()
    except ProviderNotAvailableError as exc:
        logger.warning("Provider %s unavailable (%s), falling back to local", name, exc)
        return _PROVIDER_FACTORIES["local"]()
