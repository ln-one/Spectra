from schemas.project_space import ArtifactType
from services.project_space_service.artifact_content import normalize_artifact_content


def test_normalize_html_animation_storyboard_sets_html_without_mode() -> None:
    normalized = normalize_artifact_content(
        ArtifactType.HTML.value,
        {
            "kind": "animation_storyboard",
            "title": "冒泡排序演示",
            "summary": "第一轮比较并交换",
            "scenes": [
                {"title": "第1步", "description": "比较相邻元素并交换"},
            ],
        },
    )

    assert normalized.get("kind") == "animation_storyboard"
    html_content = str(normalized.get("html") or "")
    assert html_content.startswith("<!doctype html>")
    assert "冒泡排序演示" in html_content
    assert "第1步" in html_content
    assert "Studio Runtime 预览" in html_content
    assert "__SPECTRA_DEBUG_SPEC__" not in html_content
