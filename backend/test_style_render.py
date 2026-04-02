"""本地测试富样式渲染链路 - 只测试 Markdown 生成"""

from pathlib import Path

from services.generation.types import CoursewareContent, PageClassItem, StyleManifest
from services.template import TemplateConfig, TemplateService


def test_style_markdown():
    """测试样式 Markdown 生成（不需要 Marp CLI）"""

    # 1. 准备测试内容
    content = CoursewareContent(
        title="富样式测试课件",
        markdown_content="""# 富样式测试课件

欢迎使用 Spectra 智能课件系统

---

# 目录

- 第一章：设计家族介绍
- 第二章：页面类型演示
- 第三章：密度对比

---

# 第一章：设计家族介绍

- Editorial Bold：大标题、强分割线
- Academic Modern：学术风格、清晰层级
- Visual Cards：卡片化、模块感强

---

# 第二章：页面类型演示

- Cover：封面页，稀疏布局
- TOC：目录页，中等密度
- Content：内容页，可变密度

---

# 第三章：密度对比

- Sparse：<=3 个要点
- Medium：4-5 个要点
- Dense：>=6 个要点，适合信息密集场景
- 第四点
- 第五点
- 第六点
- 第七点""",
        lesson_plan_markdown="# 教学目标\n\n测试富样式渲染",
        style_manifest=StyleManifest(
            design_name="editorial_bold",
            palette={"primary": "#000000", "secondary": "#666666"},
            typography={"heading": "48px", "body": "28px"},
            page_variants=["cover", "toc", "content"],
            density_rules={"sparse": "<=3", "medium": "4-5", "dense": ">=6"}
        ),
        extra_css=".custom-highlight { background: #ffeb3b; padding: 5px; }",
        page_class_plan=[
            PageClassItem(slide_index=1, page_type="cover", density="sparse", class_name="cover density-sparse"),
            PageClassItem(slide_index=2, page_type="toc", density="medium", class_name="toc density-medium"),
            PageClassItem(slide_index=3, page_type="content", density="medium", class_name="content density-medium"),
            PageClassItem(slide_index=4, page_type="content", density="medium", class_name="content density-medium"),
            PageClassItem(slide_index=5, page_type="content", density="dense", class_name="content density-dense"),
        ]
    )

    # 2. 生成完整 Markdown
    service = TemplateService()
    full_markdown = service.wrap_markdown_with_template(
        markdown_content=content.markdown_content,
        config=TemplateConfig(),
        title=content.title,
        style_manifest=content.style_manifest.model_dump() if content.style_manifest else None,
        extra_css=content.extra_css,
        page_class_plan=[item.model_dump() for item in content.page_class_plan] if content.page_class_plan else None,
    )

    # 3. 保存到文件
    output_path = Path("generated/test_style_output.md")
    output_path.parent.mkdir(exist_ok=True)
    output_path.write_text(full_markdown, encoding="utf-8")

    print(f"[OK] Markdown generated: {output_path.absolute()}")
    print(f"[OK] File size: {len(full_markdown)} bytes")
    print(f"[OK] Lines: {len(full_markdown.splitlines())}")

    # 4. 验证关键内容
    checks = [
        ("Frontmatter", "marp: true" in full_markdown),
        ("Editorial Bold CSS", "Editorial Bold Design Family" in full_markdown),
        ("Cover class", "<!-- _class: cover density-sparse -->" in full_markdown),
        ("TOC class", "<!-- _class: toc density-medium -->" in full_markdown),
        ("Content class", "<!-- _class: content density-medium -->" in full_markdown),
        ("Dense class", "<!-- _class: content density-dense -->" in full_markdown),
        ("Extra CSS", ".custom-highlight" in full_markdown),
        ("Manifest CSS", "--color-primary" in full_markdown or "section {" in full_markdown),
    ]

    print("\n[Validation]")
    for name, passed in checks:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} {name}")

    # 5. 显示前 80 行预览
    print(f"\n[Preview] First 80 lines of {output_path.name}:")
    print("-" * 70)
    for i, line in enumerate(full_markdown.splitlines()[:80], 1):
        print(f"{i:3d} | {line}")

    return output_path


if __name__ == "__main__":
    result = test_style_markdown()
    print(f"\n[Done] Open this file to inspect: {result}")
    print("[Tip] Use Marp CLI or Marp for VS Code to render it to PPTX")
