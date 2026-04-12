from services.artifact_generator.animation_compiler import preflight_check
from services.artifact_generator.animation_ir import AnimationPlan


def _base_plan_payload():
    return {
        "scene_meta": {
            "title": "排序演示",
            "subtitle": "冒泡排序",
            "duration_seconds": 8,
            "background_gradient": ["#f3fbff", "#d8ecfb"],
        },
        "objects": [
            {
                "id": "arr_0",
                "type": "box",
                "label": "5",
                "color": "BLUE",
                "position": [-2, 0],
                "size": {"width": 1.0, "height": 1.0},
                "style": {"fill_opacity": 0.3},
            },
            {
                "id": "arr_1",
                "type": "box",
                "label": "3",
                "color": "BLUE",
                "position": [0, 0],
                "size": {"width": 1.0, "height": 1.0},
                "style": {"fill_opacity": 0.3},
            },
        ],
        "timeline": [],
        "transitions": [],
        "text_blocks": [],
    }


def test_preflight_downgrades_transform_without_new_text():
    payload = _base_plan_payload()
    payload["timeline"] = [
        {
            "description": "尝试交换元素",
            "actions": [
                {
                    "type": "transform",
                    "target": "arr_0",
                    "params": {},
                }
            ],
            "wait_after": 0.2,
        }
    ]
    plan = AnimationPlan.model_validate(payload)

    errors = preflight_check(plan)

    assert not any("transform action missing 'new_text' parameter" in e for e in errors)
    assert plan.timeline[0].actions[0].type == "indicate"


def test_preflight_filters_nonexistent_targets_in_actions():
    payload = _base_plan_payload()
    payload["timeline"] = [
        {
            "description": "高亮比较项",
            "actions": [
                {
                    "type": "indicate",
                    "target": ["arr_0", "arr_1_swap", "arr_0_swap"],
                    "params": {"color": "YELLOW"},
                },
                {
                    "type": "fade_in",
                    "target": "ghost_obj",
                    "params": {},
                },
            ],
            "wait_after": 0.2,
        }
    ]
    plan = AnimationPlan.model_validate(payload)

    errors = preflight_check(plan)

    assert not any("references non-existent object" in e for e in errors)
    assert len(plan.timeline[0].actions) == 1
    assert plan.timeline[0].actions[0].target == "arr_0"
