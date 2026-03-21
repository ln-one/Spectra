from zipfile import ZIP_DEFLATED, ZipFile

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


def generate_pptx_placeholder(storage_path: str, title: str) -> None:
    safe_title = title.replace("&", "&amp;")
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
                f'<p:extLst><p:ext uri="{safe_title}"/></p:extLst>'
                "</p:presentation>"
            ),
        )


def generate_docx_placeholder(storage_path: str, title: str) -> None:
    safe_title = title.replace("&", "&amp;")
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
                f"{safe_title}"
                "</w:t></w:r></w:p></w:body></w:document>"
            ),
        )
