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
    assert "resolveBullets(scene, spec, 2)" in _HTML_TEMPLATE


def test_html_template_disables_process_flow_cross_scene_blend():
    assert (
        'const disableCrossSceneBlend = spec.visual_type === "process_flow";'
        in _HTML_TEMPLATE
    )


def test_html_template_uses_shot_based_process_flow_layouts():
    assert "function renderProcessIntroScene(" in _HTML_TEMPLATE
    assert "function renderProcessFocusScene(" in _HTML_TEMPLATE
    assert "function renderProcessSummaryScene(" in _HTML_TEMPLATE


def test_html_template_process_flow_supports_tcp_handshake_dynamic():
    assert "function resolveProcessProtocol(" in _HTML_TEMPLATE
    assert "function resolveTcpHandshakeStepIndex(" in _HTML_TEMPLATE
    assert "SYN+ACK" in _HTML_TEMPLATE
    assert "ESTABLISHED" in _HTML_TEMPLATE


def test_html_template_hides_rhythm_chip():
    assert "节奏：" not in _HTML_TEMPLATE


def test_html_template_hides_process_flow_subtitle():
    assert 'const subtitleText = spec.visual_type === "process_flow"' in _HTML_TEMPLATE
