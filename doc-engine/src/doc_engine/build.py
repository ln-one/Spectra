from __future__ import annotations

import tempfile
from pathlib import Path

import yaml

from .ai import load_ai_tasks, write_ai_brief
from .assemble import build_merged_markdown
from .models import BuildArtifacts, DocumentProfile, SourceBundle
from .profiles import load_profile
from .word_pipeline import build_reference_docx, postprocess_docx, render_pdf_if_available, run_pandoc


def build_document(
    *,
    profile_path: Path,
    source_bundle: SourceBundle,
    build_dir: Path,
    output_name: str = "output",
    exec_summary_file: Path | None = None,
    profile_overrides: dict | None = None,
) -> BuildArtifacts:
    profile: DocumentProfile = load_profile(profile_path)
    if profile_overrides:
        for key, value in profile_overrides.items():
            setattr(profile, key, value)
    build_dir.mkdir(parents=True, exist_ok=True)
    meta = {}
    if source_bundle.meta_path and source_bundle.meta_path.exists():
        with source_bundle.meta_path.open("r", encoding="utf-8") as handle:
            meta = yaml.safe_load(handle) or {}
        if not isinstance(meta, dict):
            raise ValueError("meta.yaml must contain a mapping.")
        if meta.get("title"):
            profile.title = str(meta["title"])

    merged_markdown = build_dir / f"{output_name}.merged.md"
    output_docx = build_dir / f"{output_name}.docx"
    output_pdf = build_dir / f"{output_name}.pdf"
    ai_brief_path = build_dir / f"{output_name}.ai-brief.md"

    merged_text = build_merged_markdown(
        markdown_files=source_bundle.markdown_files,
        profile=profile,
        exec_summary_file=exec_summary_file,
        extra_meta=meta,
    )
    merged_markdown.write_text(merged_text, encoding="utf-8")

    ai_tasks = load_ai_tasks(source_bundle.ai_tasks_path)
    ai_brief = write_ai_brief(ai_brief_path, ai_tasks, source_bundle.markdown_files, profile.name)

    with tempfile.TemporaryDirectory(prefix="doc-engine-ref-") as tmpdir:
        reference_docx = Path(tmpdir) / "reference.docx"
        build_reference_docx(profile, reference_docx)
        run_pandoc(merged_markdown, output_docx, reference_docx, include_toc=profile.include_toc)

    postprocess_docx(output_docx, profile)
    rendered_pdf = render_pdf_if_available(output_docx, output_pdf) if profile.include_pdf else None
    return BuildArtifacts(
        merged_markdown=merged_markdown,
        output_docx=output_docx,
        output_pdf=rendered_pdf,
        ai_brief=ai_brief,
    )
