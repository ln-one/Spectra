import logging
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


class ArtifactOfficeMixin:
    async def generate_pptx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
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
        logger.info("Generated PPTX placeholder at %s", storage_path)
        return storage_path

    async def generate_docx(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
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
                    "<w:body><w:p><w:r><w:t>"
                    f"{title}"
                    "</w:t></w:r></w:p></w:body></w:document>"
                ),
            )
        logger.info("Generated DOCX placeholder at %s", storage_path)
        return storage_path
