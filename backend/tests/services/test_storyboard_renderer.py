from pathlib import Path

from PIL import Image

from services.artifact_generator.storyboard_renderer import (
    render_gif,
    render_storyboard_frames,
)


def test_render_storyboard_frames_uses_algorithm_runtime_graph_steps():
    content = {
        "title": "冒泡排序演示",
        "summary": "交换高亮项，最终升序",
        "runtime_graph": {
            "steps": [
                {
                    "primary_caption": {"title": "比较 5 和 3", "body": "5 > 3，交换"},
                    "entities": [
                        {
                            "kind": "track_stack",
                            "items": [
                                {"value": 5, "accent": "swap"},
                                {"value": 3, "accent": "swap"},
                                {"value": 4, "accent": "muted"},
                            ],
                        }
                    ],
                },
                {
                    "primary_caption": {"title": "完成排序", "body": "最小值到前方"},
                    "entities": [
                        {
                            "kind": "track_stack",
                            "items": [
                                {"value": 2, "accent": "success"},
                                {"value": 3, "accent": "success"},
                                {"value": 4, "accent": "success"},
                            ],
                        }
                    ],
                },
            ]
        },
    }

    frames = render_storyboard_frames(content)

    assert len(frames) == 2
    # White-background style card should not be dark fallback palette.
    pixel = frames[0].getpixel((2, 2))
    assert pixel[0] > 220 and pixel[1] > 220 and pixel[2] > 220


def test_render_storyboard_frames_uses_algorithm_snapshot_steps():
    content = {
        "title": "选择排序",
        "steps": [
            {
                "action": "swap",
                "title": "交换最小值",
                "snapshot": [7, 1, 5],
                "swap_indices": [0, 1],
            },
            {
                "action": "done",
                "title": "完成",
                "snapshot": [1, 5, 7],
                "sorted_indices": [0, 1, 2],
            },
        ],
    }

    frames = render_storyboard_frames(content)

    assert len(frames) == 2


def test_render_gif_step_mode_slows_down_animation(tmp_path: Path):
    content = {
        "title": "冒泡排序",
        "focus": "一步一步讲解交换过程",
        "steps": [
            {"action": "swap", "snapshot": [5, 3, 4], "swap_indices": [0, 1]},
            {"action": "done", "snapshot": [3, 4, 5], "sorted_indices": [0, 1, 2]},
        ],
    }
    output = tmp_path / "step-mode.gif"

    render_gif(content, str(output))

    image = Image.open(output)
    duration = image.info.get("duration")
    assert isinstance(duration, int)
    assert duration >= 900
