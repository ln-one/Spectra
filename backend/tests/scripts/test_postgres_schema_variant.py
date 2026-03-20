from __future__ import annotations

from pathlib import Path

from scripts.postgres_schema_variant import (
    render_postgres_schema_variant,
    write_postgres_schema_variant,
)


def test_render_postgres_schema_variant_rewrites_provider_once() -> None:
    rendered, replacements = render_postgres_schema_variant(
        'datasource db {\n  provider = "sqlite"\n  url = env("DATABASE_URL")\n}\n'
    )

    assert replacements == 1
    assert 'provider = "postgresql"' in rendered
    assert 'provider = "sqlite"' not in rendered


def test_write_postgres_schema_variant_emits_output_file(tmp_path: Path) -> None:
    source = tmp_path / "schema.prisma"
    target = tmp_path / "schema.postgres.prisma"
    source.write_text(
        'generator client {}\ndatasource db {\n  provider = "sqlite"\n}\n',
        encoding="utf-8",
    )

    output_path, replacements = write_postgres_schema_variant(source, target)

    assert replacements == 1
    assert output_path == target
    assert 'provider = "postgresql"' in target.read_text(encoding="utf-8")


def test_render_postgres_schema_variant_can_retarget_shadow_env() -> None:
    rendered, replacements = render_postgres_schema_variant(
        'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n',
        url_env_var="POSTGRES_SHADOW_DATABASE_URL",
    )

    assert replacements == 1
    assert 'provider = "postgresql"' in rendered
    assert 'env("POSTGRES_SHADOW_DATABASE_URL")' in rendered
