from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "services"
    / "courseware_ai"
    / "generation_support.py"
)
MODULE_SPEC = spec_from_file_location("courseware_generation_support", MODULE_PATH)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
generation_support = module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(generation_support)

_collect_rag_bullets = generation_support._collect_rag_bullets
build_rag_grounded_fallback_courseware = (
    generation_support.build_rag_grounded_fallback_courseware
)


def test_collect_rag_bullets_ignores_filename_prefix_noise() -> None:
    bullets = _collect_rag_bullets(
        [
            {
                "content": "ch1_引言_v2(1).pdf: 86d9d6f69c2251837a.jpg) # 本章目标 1. 了解计算机网络",
                "source": {"filename": "ch1_引言_v2(1).pdf"},
            }
        ]
    )

    assert bullets
    assert "ch1_引言_v2(1).pdf" not in bullets[0]
    assert ".jpg" not in bullets[0]
    assert "本章目标" in bullets[0]


def test_rag_grounded_fallback_uses_outline_points_instead_of_english_filler() -> None:
    courseware = build_rag_grounded_fallback_courseware(
        user_requirements="计算机网络课程",
        rag_context=[
            {
                "content": "教材指出：网络分层的核心价值是降低复杂度并支持协议解耦。",
                "source": {"filename": "networks.pdf"},
            }
        ],
        outline_document={
            "title": "计算机网络导论",
            "nodes": [
                {
                    "order": 1,
                    "title": "课程任务与宏观认知",
                    "key_points": ["课程目标", "网络应用场景", "学习路径"],
                },
                {
                    "order": 2,
                    "title": "分层模型与交换技术",
                    "key_points": ["分层模型", "电路交换", "分组交换"],
                },
                {
                    "order": 3,
                    "title": "网络层协议与路由实践",
                    "key_points": ["IPv4/IPv6", "路由选择", "常见协议"],
                },
            ],
        },
    )

    assert courseware is not None
    assert (
        "Follow-up discussion based on selected sources"
        not in courseware.markdown_content
    )
    assert "结合已检索资料" in courseware.markdown_content
    assert "分层模型与交换技术" in courseware.markdown_content
    assert "讲解要求" in courseware.lesson_plan_markdown
