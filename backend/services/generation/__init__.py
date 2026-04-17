"""Markdown compatibility helpers only.

This package is a residual compatibility surface for markdown normalization and
shared render-input data shapes. It is not a generation backend and it is not a
render authority.

- Diego owns formal PPT outline/generation authority.
- Pagevra owns formal preview/render/export authority.
- ``services.generation`` only keeps narrow compatibility helpers that are
  still consumed by local shell code.
"""

__all__: list[str] = []
