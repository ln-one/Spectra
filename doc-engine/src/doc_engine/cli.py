from __future__ import annotations

import argparse
from pathlib import Path

from .build import build_document
from .models import SourceBundle


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build DOCX/PDF documents from layered templates and markdown.")
    parser.add_argument("profile", help="Path to profile yaml.")
    parser.add_argument("source", help="Source directory containing markdown files.")
    parser.add_argument("--meta", help="Path to meta.yaml.", default=None)
    parser.add_argument("--ai-tasks", help="Path to ai_tasks.yaml.", default=None)
    parser.add_argument("--exec-summary", help="Optional front summary markdown file.", default=None)
    parser.add_argument("--glob", help="Glob for markdown chapters.", default="*.md")
    parser.add_argument("--build-dir", help="Build output directory.", default="build")
    parser.add_argument("--output-name", help="Base name for artifacts.", default="output")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    source_dir = Path(args.source).resolve()
    markdown_files = sorted(source_dir.glob(args.glob))
    if not markdown_files:
        parser.error(f"No markdown files matched {args.glob} under {source_dir}")

    bundle = SourceBundle(
        source_dir=source_dir,
        markdown_files=markdown_files,
        meta_path=Path(args.meta).resolve() if args.meta else None,
        ai_tasks_path=Path(args.ai_tasks).resolve() if args.ai_tasks else None,
    )
    artifacts = build_document(
        profile_path=Path(args.profile).resolve(),
        source_bundle=bundle,
        build_dir=Path(args.build_dir).resolve(),
        output_name=args.output_name,
        exec_summary_file=Path(args.exec_summary).resolve() if args.exec_summary else None,
    )
    print(f"DOCX: {artifacts.output_docx}")
    print(f"MERGED: {artifacts.merged_markdown}")
    if artifacts.output_pdf:
        print(f"PDF: {artifacts.output_pdf}")
    if artifacts.ai_brief:
        print(f"AI BRIEF: {artifacts.ai_brief}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
