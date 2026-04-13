from services.artifact_generator.manim_renderer import (
    _align_timeline_with_scenes,
    _build_ir_prompt,
)


def test_align_timeline_with_scenes_fills_missing_steps():
    plan_json = {
        "scene_meta": {"title": "TCP"},
        "objects": [
            {"id": "client", "type": "box"},
            {"id": "server", "type": "box"},
        ],
        "timeline": [
            {
                "description": "old step",
                "actions": [{"type": "fade_in", "target": "client"}],
                "wait_after": 0.2,
            }
        ],
    }
    spec = {
        "scenes": [
            {"title": "第一步", "description": "客户端发送 SYN"},
            {"title": "第二步", "description": "服务端返回 SYN-ACK"},
            {"title": "第三步", "description": "客户端返回 ACK"},
        ]
    }

    aligned = _align_timeline_with_scenes(plan_json, spec)

    assert len(aligned["timeline"]) == 3
    assert aligned["timeline"][0]["description"].startswith("第一步")
    assert aligned["timeline"][1]["description"].startswith("第二步")
    assert aligned["timeline"][2]["description"].startswith("第三步")


def test_align_timeline_with_scenes_rewrites_existing_descriptions():
    plan_json = {
        "scene_meta": {"title": "流程"},
        "objects": [{"id": "a", "type": "box"}],
        "timeline": [
            {"description": "foo", "actions": [], "wait_after": 0.1},
            {"description": "bar", "actions": [], "wait_after": 0.1},
        ],
    }
    spec = {
        "scenes": [
            {"title": "镜头 A", "description": "展示输入"},
            {"title": "镜头 B", "description": "展示输出"},
        ]
    }

    aligned = _align_timeline_with_scenes(plan_json, spec)

    assert aligned["timeline"][0]["description"].startswith("镜头 A")
    assert aligned["timeline"][1]["description"].startswith("镜头 B")


def test_build_ir_prompt_mentions_icon_type_and_name_rules():
    spec = {
        "topic": "光合作用",
        "visual_type": "scientific_process",
        "theme": {"background": "#f3fbff", "panel": "#d8ecfb", "accent": "#2f6da5"},
    }

    system_prompt, _ = _build_ir_prompt(spec)

    assert "box|circle|dot|text|arrow|icon" in system_prompt
    assert "icon 对象必须提供 name 字段" in system_prompt


def test_align_timeline_enforces_theme_duration_and_min_shots():
    plan_json = {
        "scene_meta": {"title": "光合作用", "background_gradient": ["#000000", "#111111"]},
        "objects": [{"id": "leaf", "type": "icon"}],
        "timeline": [{"description": "old", "actions": [], "wait_after": 0.2}],
    }
    spec = {
        "duration_seconds": 12,
        "theme": {"background": "#f7e9d8", "panel": "#fff5ea", "accent": "#ce7a32"},
        "scenes": [],
    }

    aligned = _align_timeline_with_scenes(plan_json, spec)

    assert aligned["scene_meta"]["duration_seconds"] == 12
    assert aligned["scene_meta"]["background_gradient"] == ["#f7e9d8", "#fff5ea"]
    assert len(aligned["timeline"]) >= 4
