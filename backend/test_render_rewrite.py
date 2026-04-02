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
        title="��课件",
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


def test_mermaid_support():
    """测试 Mermaid 图表支持"""
    from services.prompt_service.render_rewrite import build_courseware_render_rewrite_prompt

    prompt = build_courseware_render_rewrite_prompt(
        markdown_content="# 测试\n\n内容",
        title="测试课件",
        slide_count=5,
    )

    assert "mermaid" in prompt.lower()
    assert "graph" in prompt or "flowchart" in prompt
    assert "节点数量" in prompt
    assert "3-8 个" in prompt
    print("[PASS] Mermaid 支持已添加到 prompt")


def test_page_structure_examples():
    """测试页面结构示例"""
    from services.prompt_service.render_rewrite import build_courseware_render_rewrite_prompt

    prompt = build_courseware_render_rewrite_prompt(
        markdown_content="# 测试",
        title="测试",
        slide_count=3,
    )

    assert "page_structure_examples" in prompt or "封面页示例" in prompt
    assert "<!-- _class: cover" in prompt
    assert "toc density-medium" in prompt
    print("[PASS] 页面结构示例已添加")


def test_css_reference_inclusion():
    """测试 CSS 参考包含"""
    from services.prompt_service.render_rewrite import build_courseware_render_rewrite_prompt

    # 包含 CSS 参考
    prompt_with_css = build_courseware_render_rewrite_prompt(
        markdown_content="# 测试",
        title="测试",
        slide_count=3,
        include_css_reference=True,
    )

    assert "Editorial Bold" in prompt_with_css
    assert "Academic Modern" in prompt_with_css
    assert "Visual Cards" in prompt_with_css
    print("[PASS] CSS 参考已包含")

    # 不包含 CSS 参考
    prompt_without_css = build_courseware_render_rewrite_prompt(
        markdown_content="# 测试",
        title="测试",
        slide_count=3,
        include_css_reference=False,
    )

    assert "Editorial Bold" not in prompt_without_css
    assert len(prompt_without_css) < len(prompt_with_css)
    print("[PASS] CSS 参考可选关闭")


def test_layout_diversity_requirements():
    """测试版式多样性要求"""
    from services.prompt_service.render_rewrite import build_courseware_render_rewrite_prompt

    prompt = build_courseware_render_rewrite_prompt(
        markdown_content="# 测试",
        title="测试",
        slide_count=5,
    )

    assert "layout_diversity_requirements" in prompt or "版式多样性" in prompt
    assert "不要连续 3 页都是纯列表" in prompt
    assert "适当穿插图表页" in prompt
    print("[PASS] 版式多样性要求已添加")


def test_mermaid_css_styles():
    """测试 Mermaid CSS 样式"""
    from services.template.css_generator import generate_design_family_css

    for design in ["editorial_bold", "academic_modern", "visual_cards"]:
        css = generate_design_family_css(design)
        assert ".mermaid" in css
        assert "max-width: 90%" in css
        assert "max-height: 400px" in css
        print(f"[PASS] {design} 包含 Mermaid 样式")


if __name__ == "__main__":
    test_render_markdown_priority()
    test_contract_compatibility()
    test_mermaid_support()
    test_page_structure_examples()
    test_css_reference_inclusion()
    test_layout_diversity_requirements()
    test_mermaid_css_styles()
    print("\n[OK] All tests passed")

