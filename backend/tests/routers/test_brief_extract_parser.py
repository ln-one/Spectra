from routers.chat.brief_extract_parser import (
    detect_brief_summary_block,
    parse_structured_brief_extract,
    strip_brief_extract_block,
    strip_brief_summary_markers,
)


def test_parse_structured_brief_extract_reads_flat_json_fields():
    content = """先整理一下。\n```spectra_brief_extract\n{"topic":"牛顿第二定律","audience":"高一学生"}\n```"""

    parsed = parse_structured_brief_extract(content)

    assert parsed == {
        "fields": {"topic": "牛顿第二定律", "audience": "高一学生"},
        "confidence": 0.85,
    }


def test_parse_structured_brief_extract_reads_nested_fields_and_confidence():
    content = """```spectra_brief_extract\n{"fields":{"target_pages":12},"confidence":0.92}\n```"""

    parsed = parse_structured_brief_extract(content)

    assert parsed == {
        "fields": {"target_pages": 12},
        "confidence": 0.92,
    }


def test_strip_brief_extract_block_removes_control_block_only():
    content = "这是正文。\n\n```spectra_brief_extract\n{\"topic\":\"牛顿第二定律\"}\n```"

    stripped = strip_brief_extract_block(content)

    assert stripped == "这是正文。"


def test_detect_and_strip_brief_summary_markers():
    content = """需求总结如下。\n\n```spectra_brief_summary\n{"request_confirmation": true}\n```"""

    assert detect_brief_summary_block(content) is True
    assert strip_brief_summary_markers(content) == "需求总结如下。"
