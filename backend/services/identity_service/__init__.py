"""Limora local mirror helper exports.

This package preserves the historic import surface while making it explicit
that Spectra only owns a thin local mirror, not the identity domain itself.
"""

from .service import IdentityService, identity_service

__all__ = ["IdentityService", "identity_service"]
