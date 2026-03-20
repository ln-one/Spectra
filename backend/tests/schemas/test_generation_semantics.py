from schemas.generation import (
    GenerationResultField,
    build_generation_result_payload,
    build_generation_result_payload_from_output_urls,
    build_session_output_fields,
    build_task_output_urls,
)


def test_build_task_output_urls_uses_formal_generation_type_keys():
    assert build_task_output_urls(
        pptx_url="/tmp/demo.pptx",
        docx_url="/tmp/demo.docx",
    ) == {
        "pptx": "/tmp/demo.pptx",
        "docx": "/tmp/demo.docx",
    }


def test_build_generation_result_payload_from_output_urls_projects_public_shape():
    payload = build_generation_result_payload_from_output_urls(
        {"pptx": "/tmp/demo.pptx", "docx": "/tmp/demo.docx"},
        version=3,
    )
    assert payload == {
        GenerationResultField.PPT_URL.value: "/tmp/demo.pptx",
        GenerationResultField.WORD_URL.value: "/tmp/demo.docx",
        "version": 3,
    }


def test_build_session_output_fields_projects_internal_urls_to_session_columns():
    assert build_session_output_fields({"pptx": "/tmp/demo.pptx"}) == {
        "pptUrl": "/tmp/demo.pptx",
        "wordUrl": None,
    }


def test_build_generation_result_payload_preserves_explicit_none_fields():
    payload = build_generation_result_payload(ppt_url=None, word_url=None, version=1)
    assert payload == {
        GenerationResultField.PPT_URL.value: None,
        GenerationResultField.WORD_URL.value: None,
        "version": 1,
    }
