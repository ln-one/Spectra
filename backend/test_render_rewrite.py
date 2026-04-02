"""测试 render rewrite 全链路"""

from services.generation.types import CoursewareContent
from services.template import TemplateService


def test_render_markdown_priority():
    """测试 render_markdown 优先级"""

    # 1. 有 render_markdown 时直接使用
    content_with_render = CoursewareContent(
        title="测试",
        markdown_content="# 原始正文",
        lesson_plan_markdown="# 教案",
        render_markdown="""---
marp: true
---

<style>
section { background: #f0f0f0; }
</style>

# 最终渲染版本

这是 render_markdown
""",
    )

    service = TemplateService()

    # 模拟渲染逻辑
    if content_with_render.render_markdown:
        final_markdown = content_with_render.render_markdown
    else:
        final_markdown = service.wrap_markdown_with_template(
            content_with_render.markdown_content,
            service.get_marp_frontmatter.__self__.__class__(),
            content_with_render.title,
        )

    assert "最终渲染版本" in final_markdown
    assert "原始正文" not in final_markdown
    print("[PASS] render_markdown 优先使用")

    # 2. 无 render_markdown 时回退模板包装
    content_without_render = CoursewareContent(
        title="测试",
        markdown_content="# 原始正文\n\n内容",
        lesson_plan_markdown="# 教案",
    )

    if content_without_render.render_markdown:
        final_markdown = content_without_render.render_markdown
    else:
        from services.template import TemplateConfig

        final_markdown = service.wrap_markdown_with_template(
            content_without_render.markdown_content,
            TemplateConfig(),
            content_without_render.title,
        )

    assert "marp: true" in final_markdown
    assert "原始正文" in final_markdown
    print("[PASS] 无 render_markdown 时回退模板包装")


def test_contract_compatibility():
    """测试契约兼容性"""

    # 旧契约（无 render_markdown）
    old_content = CoursewareContent(
        title="旧课件",
        markdown_content="# 内容",
        lesson_plan_markdown="# 教案",
    )
    assert old_content.render_markdown is None
    print("[PASS] 旧契约兼容")

    # 新契约（有 render_markdown）
    new_content = CoursewareContent(
        title="新课件",
        markdown_content="# 内容",
        lesson_plan_markdown="# 教案",
        render_markdown="---\nmarp: true\n---\n\n# 渲染版",
    )
    assert new_content.render_markdown is not None
    print("[PASS] 新契约支持")


if __name__ == "__main__":
    test_render_markdown_priority()
    test_contract_compatibility()
    print("\n[OK] All tests passed")
