from services.artifact_generator.html_animation_renderer import (
    _HTML_TEMPLATE,
    build_frame_plan,
)


def test_build_frame_plan_global_progress_is_monotonic():
    spec = {
        "duration_seconds": 8,
        "rhythm": "balanced",
        "scenes": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}],
    }
    plan = build_frame_plan(spec)

    assert plan
    progress = [float(item["global_progress"]) for item in plan]
    assert progress[0] == 0.0
    assert progress[-1] == 1.0
    assert all(a <= b for a, b in zip(progress, progress[1:]))


def test_build_frame_plan_scene_index_never_rewinds():
    spec = {
        "duration_seconds": 6,
        "rhythm": "fast",
        "scenes": [{"id": "s1"}, {"id": "s2"}, {"id": "s3"}, {"id": "s4"}],
    }
    plan = build_frame_plan(spec)

    scene_indices = [int(item["scene_index"]) for item in plan]
    assert all(a <= b for a, b in zip(scene_indices, scene_indices[1:]))


def test_html_template_includes_relevant_bullets_fallback():
    assert "function resolveBullets(scene, spec, limit = 3)" in _HTML_TEMPLATE
    assert "resolveBullets(scene, spec, 1)" in _HTML_TEMPLATE


def test_html_template_uses_unified_cross_scene_blend():
    assert (
        'const disableCrossSceneBlend = scenes.length <= 1;'
        in _HTML_TEMPLATE
    )
    assert "function resolveSceneCamera(" in _HTML_TEMPLATE
    assert "function resolveSceneTarget(" in _HTML_TEMPLATE
    assert "function getCameraMotion(" in _HTML_TEMPLATE
    assert "function renderCinematicOverlay(" in _HTML_TEMPLATE


def test_html_template_uses_shot_based_process_flow_layouts():
    assert "function renderProcessIntroScene(" in _HTML_TEMPLATE
    assert "function renderProcessFocusScene(" in _HTML_TEMPLATE
    assert "function renderProcessSummaryScene(" in _HTML_TEMPLATE
    assert "分镜细节页" in _HTML_TEMPLATE


def test_html_template_uses_target_lock_and_crop_overlay():
    assert "const lockStrength =" in _HTML_TEMPLATE
    assert "const cropInset =" in _HTML_TEMPLATE
    assert '${-48 + parallax},40 ${168 + parallax},0 ${110 + parallax},${HEIGHT}' not in _HTML_TEMPLATE
    assert '${WIDTH - 92 - parallax},0 ${WIDTH + 36 - parallax},0 ${WIDTH - 42 - parallax},${HEIGHT}' not in _HTML_TEMPLATE
    assert 'ellipse cx="${144 + parallax}"' in _HTML_TEMPLATE


def test_html_template_uses_shot_based_relationship_layouts():
    assert "function resolveRelationshipShot(" in _HTML_TEMPLATE
    assert "镜头一：趋势全景" in _HTML_TEMPLATE
    assert "镜头二：关键转折" in _HTML_TEMPLATE
    assert "镜头三：规律结论" in _HTML_TEMPLATE


def test_html_template_process_flow_supports_tcp_handshake_dynamic():
    assert "function resolveProcessProtocol(" in _HTML_TEMPLATE
    assert "function resolveTcpProtocolStepIndex(" in _HTML_TEMPLATE
    assert "SYN+ACK" in _HTML_TEMPLATE
    assert "ESTABLISHED" in _HTML_TEMPLATE


def test_html_template_hides_rhythm_chip():
    assert "节奏：" not in _HTML_TEMPLATE


def test_html_template_hides_process_flow_subtitle():
    assert 'const subtitleText = spec.visual_type === "process_flow"' in _HTML_TEMPLATE
