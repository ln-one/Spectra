from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class Theme:
    page_margin_cm: float = 2.0
    body_cn_font: str = "宋体"
    body_latin_font: str = "Times New Roman"
    heading_cn_font: str = "黑体"
    heading_latin_font: str = "Times New Roman"
    body_font_size_pt: float = 12.0
    title_font_size_pt: float = 24.0
    heading1_size_pt: float = 16.0
    heading2_size_pt: float = 14.0
    heading3_size_pt: float = 12.0
    line_spacing_pt: float = 22.0


@dataclass(slots=True)
class DocumentProfile:
    name: str
    title: str
    lang: str = "zh-Hans"
    include_toc: bool = True
    include_cover: bool = True
    include_pdf: bool = True
    include_exec_summary: bool = True
    exec_summary_frontmatter: bool = True
    body_starts_at: int = 1
    body_chapter_offset: int = 0
    mermaid_mode: str = "placeholder"
    figure_placeholder_text: str = "【图位占位：正式配图阶段替换】"
    dynamic_fields: bool = True
    template_layers: dict[str, str] = field(default_factory=dict)
    theme: Theme = field(default_factory=Theme)


@dataclass(slots=True)
class SourceBundle:
    source_dir: Path
    markdown_files: list[Path]
    meta_path: Path | None = None
    ai_tasks_path: Path | None = None


@dataclass(slots=True)
class BuildArtifacts:
    merged_markdown: Path
    output_docx: Path
    output_pdf: Path | None = None
    ai_brief: Path | None = None
