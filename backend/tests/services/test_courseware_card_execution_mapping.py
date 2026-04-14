from services.generation_session_service.card_execution_preview import (
    build_studio_card_execution_preview,
)
from services.generation_session_service.diego_runtime_helpers import (
    build_diego_create_payload,
)


def test_courseware_preview_maps_config_to_options():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "topic": "牛顿第二定律",
            "pages": 24,
            "generation_mode": "template",
            "template_id": "template-42",
            "style_preset": "morandi",
            "visual_policy": "media_required",
        },
        rag_source_ids=["file-1", "file-2"],
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "牛顿第二定律"
    assert options["pages"] == 24
    assert options["target_slide_count"] == 24
    assert options["generation_mode"] == "template"
    assert options["template_id"] == "template-42"
    assert options["style_preset"] == "morandi"
    assert options["visual_policy"] == "media_required"
    assert options["rag_source_ids"] == ["file-1", "file-2"]


def test_courseware_preview_normalizes_alias_and_topic_fallback():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "topic": "电磁感应",
            "target_slide_count": "18",
            "generation_mode": "classic",
        },
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "电磁感应"
    assert options["pages"] == 18
    assert options["target_slide_count"] == 18
    assert options["generation_mode"] == "template"


def test_courseware_preview_accepts_legacy_prompt_for_topic_compat():
    preview = build_studio_card_execution_preview(
        card_id="courseware_ppt",
        project_id="proj-1",
        config={
            "prompt": "遗留字段主题",
            "pages": 10,
        },
    )

    assert preview is not None
    options = preview.initial_request.payload["options"]
    assert options["topic"] == "遗留字段主题"


def test_diego_create_payload_uses_target_slide_count_and_mode_alias():
    payload = build_diego_create_payload(
        options={
            "topic": "概率统计",
            "target_slide_count": "16",
            "generation_mode": "free",
            "style_preset": "auto",
            "visual_policy": "auto",
        },
        diego_project_id="spectra-run-1",
    )

    assert payload["topic"] == "概率统计"
    assert payload["project_id"] == "spectra-run-1"
    assert payload["target_slide_count"] == 16
    assert payload["generation_mode"] == "scratch"


def test_diego_create_payload_keeps_template_fields():
    payload = build_diego_create_payload(
        options={
            "topic": "化学平衡",
            "pages": 14,
            "generation_mode": "template",
            "template_id": "template-9",
            "style_preset": "auto",
        },
        diego_project_id="spectra-run-2",
    )

    assert payload["target_slide_count"] == 14
    assert payload["generation_mode"] == "template"
    assert payload["template_id"] == "template-9"
