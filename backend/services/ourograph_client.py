"""HTTP client facade for the remote Ourograph service.

This module intentionally stays small: transport, commands, and queries live in
dedicated support modules so Spectra does not keep a giant pseudo-domain file
for formal-state access.
"""

from __future__ import annotations

from services.ourograph_client_support.commands import OurographCommandClientMixin
from services.ourograph_client_support.queries import OurographQueryClientMixin
from services.ourograph_client_support.transport import (
    ourograph_base_url,
    ourograph_enabled,
)


class OurographClient(OurographCommandClientMixin, OurographQueryClientMixin):
    """Thin remote client; formal state lives in Ourograph, not Spectra."""


ourograph_client = OurographClient()

__all__ = [
    "OurographClient",
    "ourograph_base_url",
    "ourograph_enabled",
    "ourograph_client",
]
