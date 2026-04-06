from services.generation_session_service.command_runtime_slide_modify_helpers import (
    resolve_target_slide_index,
)
from services.preview_helpers.slide_mapping import (
    build_slide_id_index_map,
    resolve_slide_index,
)


def test_build_slide_id_index_map_prefers_rendered_preview_pages():
    mapping = build_slide_id_index_map(
        task_id="task-1",
        markdown_content="# A",
        rendered_preview={
            "pages": [
                {"index": 0, "slide_id": "task-1-slide-0"},
                {"index": 1, "slide_id": "task-1-slide-1"},
                {"index": 2, "slide_id": "custom-slide-2"},
            ]
        },
    )

    assert mapping == {
        "task-1-slide-0": 1,
        "task-1-slide-1": 2,
        "custom-slide-2": 3,
    }


def test_resolve_slide_index_supports_numeric_slide_id():
    resolved = resolve_slide_index(
        slide_id="2",
        slide_index=None,
        slide_id_index_map={"task-1-slide-0": 1, "task-1-slide-1": 2},
    )
    assert resolved == 2


def test_resolve_target_slide_index_uses_preview_source_of_truth():
    preview_payload = {
        "markdown_content": "# A\n\n---\n\n# B",
        "render_markdown": "# X\n\n---\n\n# A\n\n---\n\n# B",
        "rendered_preview": {
            "pages": [
                {"index": 0, "slide_id": "task-1-slide-0"},
                {"index": 1, "slide_id": "task-1-slide-1"},
                {"index": 2, "slide_id": "task-1-slide-2"},
            ]
        },
    }
    command = {"slide_id": "task-1-slide-2"}

    resolved = resolve_target_slide_index(
        command,
        preview_payload=preview_payload,
        task_id="task-1",
    )

    assert resolved == 3


def test_resolve_target_slide_index_prefers_explicit_index():
    resolved = resolve_target_slide_index(
        {"slide_index": 4, "slide_id": "task-1-slide-1"},
        preview_payload={
            "markdown_content": "# A\n\n---\n\n# B",
            "rendered_preview": {
                "pages": [
                    {"index": 0, "slide_id": "task-1-slide-0"},
                    {"index": 1, "slide_id": "task-1-slide-1"},
                ]
            },
        },
        task_id="task-1",
    )

    assert resolved == 4
