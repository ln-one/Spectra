#!/usr/bin/env python3
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
import sys


ROOT = Path("/Users/ln1/Projects/Spectra")
ENGINE_SRC = ROOT / "doc-engine" / "src"
if str(ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(ENGINE_SRC))

from doc_engine.build import build_document
from doc_engine.models import SourceBundle


COMPETITION_DIR = ROOT / "docs" / "competition"
OUTPUT_DIR = ROOT / "docs_output"
MERGED_MD = COMPETITION_DIR / "92-final-submission-draft.md"
FINAL_DOCX = OUTPUT_DIR / "Spectra.docx"
FINAL_PDF = OUTPUT_DIR / "Spectra.pdf"
PROFILE = ROOT / "doc-engine" / "profiles" / "competition-a.yaml"

EXEC_SUMMARY = COMPETITION_DIR / "00-executive-summary.md"
BODY_CHAPTERS = [
    COMPETITION_DIR / "01-overview.md",
    COMPETITION_DIR / "02-feasibility.md",
    COMPETITION_DIR / "03-requirements-analysis.md",
    COMPETITION_DIR / "04-architecture.md",
    COMPETITION_DIR / "05-key-technologies.md",
    COMPETITION_DIR / "06-testing-evaluation.md",
    COMPETITION_DIR / "07-organization-management.md",
    COMPETITION_DIR / "08-business-plan.md",
    COMPETITION_DIR / "09-risk-management.md",
    COMPETITION_DIR / "10-conclusion.md",
]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bundle = SourceBundle(
        source_dir=COMPETITION_DIR,
        markdown_files=BODY_CHAPTERS,
        meta_path=None,
        ai_tasks_path=None,
    )

    with tempfile.TemporaryDirectory(prefix="spectra-docx-build-") as tmpdir:
        artifacts = build_document(
            profile_path=PROFILE,
            source_bundle=bundle,
            build_dir=Path(tmpdir),
            output_name="Spectra",
            exec_summary_file=EXEC_SUMMARY,
            profile_overrides={"title": "Spectra 商业方案书"},
        )

        shutil.copy2(artifacts.merged_markdown, MERGED_MD)
        shutil.copy2(artifacts.output_docx, FINAL_DOCX)
        if artifacts.output_pdf:
            shutil.copy2(artifacts.output_pdf, FINAL_PDF)

    print(f"Merged markdown: {MERGED_MD}")
    print(f"DOCX: {FINAL_DOCX}")
    if FINAL_PDF.exists():
        print(f"PDF: {FINAL_PDF}")


if __name__ == "__main__":
    main()
