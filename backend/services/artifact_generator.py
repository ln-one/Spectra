"""
Artifact Generator Service

Generates 8 types of artifacts for project space:
- pptx/docx: Delegates to existing GenerationService
- mindmap/outline/quiz/summary/animation: Generates JSON structures
- handout: Uses Pandoc to generate DOCX
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict
from zipfile import ZIP_DEFLATED, ZipFile

logger = logging.getLogger(__name__)

PKG_CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
PACKAGE_RELS_CT = "application/vnd.openxmlformats-package.relationships+xml"
OFFDOC_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
)
OFFDOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PPT_MAIN_CT = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
)
DOCX_MAIN_CT = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
)
DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
PRESENTATIONML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
WORDML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


class ArtifactGenerator:
    """
    Artifact generation service for 8 capability types.

    Storage structure:
    uploads/artifacts/{project_id}/{type}/{artifact_id}.{ext}
    """

    def __init__(self, base_dir: str = "uploads/artifacts"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"ArtifactGenerator initialized with base_dir: {self.base_dir}")

    def get_storage_path(
        self, project_id: str, artifact_type: str, artifact_id: str
    ) -> str:
        """
        Generate storage path for artifact.

        Args:
            project_id: Project ID
            artifact_type: Artifact type (pptx/docx/mindmap/etc.)
            artifact_id: Artifact ID

        Returns:
            Relative storage path
        """
        extension_map = {
            "pptx": "pptx",
            "docx": "docx",
            "mindmap": "json",
            "summary": "json",
            "exercise": "json",
            "html": "html",
            "gif": "gif",
            "mp4": "mp4",
        }

        ext = extension_map.get(artifact_type, "bin")
        type_dir = self.base_dir / project_id / artifact_type
        type_dir.mkdir(parents=True, exist_ok=True)

        file_path = type_dir / f"{artifact_id}.{ext}"
        return str(file_path)

    async def generate_mindmap(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate mindmap JSON structure.

        Expected content format:
        {
            "title": "主题",
            "nodes": [
                {"id": "1", "label": "节点1", "level": 0, "parent_id": null},
                {"id": "2", "label": "节点2", "level": 1, "parent_id": "1"}
            ]
        }

        Returns:
            Storage path
        """
        storage_path = self.get_storage_path(project_id, "mindmap", artifact_id)

        # Generate mindmap structure
        mindmap_data = {
            "title": content.get("title", "思维导图"),
            "nodes": content.get("nodes", []),
            "edges": self._build_edges_from_nodes(content.get("nodes", [])),
            "metadata": {
                "generated_at": "now",
                "artifact_id": artifact_id,
            },
        }

        # Save to file
        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(mindmap_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Generated mindmap at {storage_path}")
        return storage_path

    def _build_edges_from_nodes(self, nodes: list) -> list:
        """Build edges from parent-child relationships in nodes."""
        edges = []
        for node in nodes:
            if node.get("parent_id"):
                edges.append(
                    {
                        "from": node["parent_id"],
                        "to": node["id"],
                    }
                )
        return edges

    async def generate_pptx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate minimal PPTX placeholder package.

        The file is a valid zip container with OpenXML core entries so that
        download/export links are testable in core phase.
        """
        storage_path = self.get_storage_path(project_id, "pptx", artifact_id)
        title = str(content.get("title", "Project Space PPTX")).replace("&", "&amp;")

        with ZipFile(storage_path, "w", compression=ZIP_DEFLATED) as zf:
            zf.writestr(
                "[Content_Types].xml",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<Types xmlns="{PKG_CT_NS}">'
                    '<Default Extension="rels" '
                    f'ContentType="{PACKAGE_RELS_CT}"/>'
                    '<Default Extension="xml" ContentType="application/xml"/>'
                    '<Override PartName="/ppt/presentation.xml" '
                    f'ContentType="{PPT_MAIN_CT}"/>'
                    "</Types>"
                ),
            )
            zf.writestr(
                "_rels/.rels",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<Relationships xmlns="{PKG_REL_NS}">'
                    '<Relationship Id="rId1" '
                    f'Type="{OFFDOC_REL_TYPE}" '
                    'Target="ppt/presentation.xml"/>'
                    "</Relationships>"
                ),
            )
            zf.writestr(
                "ppt/presentation.xml",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<p:presentation xmlns:a="{DRAWINGML_NS}" '
                    f'xmlns:r="{OFFDOC_REL_NS}" '
                    f'xmlns:p="{PRESENTATIONML_NS}">'
                    "<p:sldMasterIdLst/><p:sldIdLst/>"
                    '<p:notesSz cx="6858000" cy="9144000"/>'
                    f'<p:extLst><p:ext uri="{title}"/></p:extLst>'
                    "</p:presentation>"
                ),
            )

        logger.info(f"Generated PPTX placeholder at {storage_path}")
        return storage_path

    async def generate_docx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate minimal DOCX placeholder package.

        The placeholder is enough for core artifact flow validation.
        """
        storage_path = self.get_storage_path(project_id, "docx", artifact_id)
        title = str(content.get("title", "Project Space DOCX")).replace("&", "&amp;")

        with ZipFile(storage_path, "w", compression=ZIP_DEFLATED) as zf:
            zf.writestr(
                "[Content_Types].xml",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<Types xmlns="{PKG_CT_NS}">'
                    '<Default Extension="rels" '
                    f'ContentType="{PACKAGE_RELS_CT}"/>'
                    '<Default Extension="xml" ContentType="application/xml"/>'
                    '<Override PartName="/word/document.xml" '
                    f'ContentType="{DOCX_MAIN_CT}"/>'
                    "</Types>"
                ),
            )
            zf.writestr(
                "_rels/.rels",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<Relationships xmlns="{PKG_REL_NS}">'
                    '<Relationship Id="rId1" '
                    f'Type="{OFFDOC_REL_TYPE}" '
                    'Target="word/document.xml"/>'
                    "</Relationships>"
                ),
            )
            zf.writestr(
                "word/document.xml",
                (
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    f'<w:document xmlns:w="{WORDML_NS}">'
                    "<w:body>"
                    "<w:p><w:r><w:t>"
                    f"{title}"
                    "</w:t></w:r></w:p>"
                    "</w:body>"
                    "</w:document>"
                ),
            )

        logger.info(f"Generated DOCX placeholder at {storage_path}")
        return storage_path

    async def generate_outline(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate outline JSON structure.

        Expected content format:
        {
            "title": "大纲标题",
            "sections": [
                {
                    "title": "第一章",
                    "level": 1,
                    "content": "内容",
                    "subsections": [...]
                }
            ]
        }

        Returns:
            Storage path
        """
        storage_path = self.get_storage_path(project_id, "summary", artifact_id)

        outline_data = {
            "title": content.get("title", "课程大纲"),
            "sections": content.get("sections", []),
            "metadata": {
                "generated_at": "now",
                "artifact_id": artifact_id,
            },
        }

        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(outline_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Generated outline at {storage_path}")
        return storage_path

    async def generate_quiz(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate quiz JSON structure.

        Expected content format:
        {
            "title": "练习题",
            "questions": [
                {
                    "question": "题目",
                    "type": "single_choice",
                    "options": ["A", "B", "C", "D"],
                    "answer": "A",
                    "explanation": "解析"
                }
            ]
        }

        Returns:
            Storage path
        """
        storage_path = self.get_storage_path(project_id, "exercise", artifact_id)

        quiz_data = {
            "title": content.get("title", "练习题"),
            "questions": content.get("questions", []),
            "metadata": {
                "generated_at": "now",
                "artifact_id": artifact_id,
                "total_questions": len(content.get("questions", [])),
            },
        }

        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(quiz_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Generated quiz at {storage_path}")
        return storage_path

    async def generate_summary(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate summary JSON.

        Expected content format:
        {
            "title": "总结标题",
            "summary": "总结内容",
            "key_points": ["要点1", "要点2"]
        }

        Returns:
            Storage path
        """
        storage_path = self.get_storage_path(project_id, "summary", artifact_id)

        summary_data = {
            "title": content.get("title", "课程总结"),
            "summary": content.get("summary", ""),
            "key_points": content.get("key_points", []),
            "metadata": {
                "generated_at": "now",
                "artifact_id": artifact_id,
            },
        }

        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Generated summary at {storage_path}")
        return storage_path

    async def generate_animation(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        """
        Generate a GIF placeholder artifact.

        This path is retained for generic GIF artifacts. Animation storyboard
        defaults are now generated through HTML + metadata.kind semantics.

        Returns:
            Storage path (GIF 占位图，便于下载链路闭环)
        """
        # Write a minimal 1x1 transparent GIF to keep media type and extension aligned.
        storage_path = self.get_storage_path(project_id, "gif", artifact_id)
        # GIF89a, logical screen 1x1, transparent pixel.
        gif_bytes = (
            b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
            b"\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00"
            b",\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
        )
        with open(storage_path, "wb") as f:
            f.write(gif_bytes)

        logger.info(f"Generated animation placeholder GIF at {storage_path}")
        return storage_path

    async def generate_html(
        self, content: str, project_id: str, artifact_id: str
    ) -> str:
        """
        Generate HTML artifact.

        Args:
            content: HTML content string
            project_id: Project ID
            artifact_id: Artifact ID

        Returns:
            Storage path
        """
        storage_path = self.get_storage_path(project_id, "html", artifact_id)

        with open(storage_path, "w", encoding="utf-8") as f:
            f.write(content)

        logger.info(f"Generated HTML at {storage_path}")
        return storage_path

    async def generate_video_placeholder(
        self, project_id: str, artifact_id: str
    ) -> str:
        """
        Generate a minimal MP4 placeholder file for download flow.
        """
        storage_path = self.get_storage_path(project_id, "mp4", artifact_id)
        # Minimal MP4 ftyp + free boxes; enough for download-chain verification.
        mp4_bytes = (
            b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" b"\x00\x00\x00\x08free"
        )
        with open(storage_path, "wb") as f:
            f.write(mp4_bytes)

        logger.info(f"Generated MP4 placeholder at {storage_path}")
        return storage_path


# Global artifact generator instance
artifact_generator = ArtifactGenerator()
