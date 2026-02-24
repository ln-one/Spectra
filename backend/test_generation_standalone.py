"""
独立测试脚本 - 课件生成服务

无需数据库、无需认证、无需其他服务
直接测试 generation_service 和 template_service

运行方式：
    cd backend
    python test_generation_standalone.py
"""

import asyncio
import sys
from pathlib import Path

# 添加当前目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from services.generation_service import CoursewareContent, generation_service
from services.template_service import TemplateConfig, TemplateStyle, template_service


async def test_generation():
    """测试课件生成服务"""
    
    print("=" * 60)
    print("测试课件生成服务（独立模块）")
    print("=" * 60)
    
    # 1. 准备模板配置
    print("\n[1] 准备模板配置...")
    config = TemplateConfig(
        style=TemplateStyle.DEFAULT,
        primary_color="#3B82F6",
        enable_pagination=True,
        enable_footer=True,
    )
    print(f"✓ 模板风格: {config.style}")
    print(f"✓ 主题色: {config.primary_color}")
    
    # 2. 准备 Mock Markdown 内容
    print("\n[2] 准备 Mock Markdown 内容...")
    
    # PPT 内容（Marp 格式）
    ppt_markdown = """# 牛顿第二定律

## 核心公式

$F = ma$

- **F**: 力（单位：牛顿 N）
- **m**: 质量（单位：千克 kg）
- **a**: 加速度（单位：m/s²）

---

## 生活案例

火箭发射时，推力 F 越大，加速度 a 越大

---

## 课堂练习

1. 一个质量为 2kg 的物体，受到 10N 的力，加速度是多少？
2. 如何用这个公式解释汽车启动？
"""
    
    # 教案内容（Pandoc 格式）
    lesson_plan_markdown = """# 牛顿第二定律 - 教案

## 教学目标

- 理解牛顿第二定律的物理意义
- 掌握 F=ma 公式的应用
- 能够解决简单的力学问题

## 教学过程

### 导入环节（5分钟）

通过火箭发射视频引入课题，激发学生兴趣。

### 新课讲授（20分钟）

1. 推导公式 F=ma
2. 讲解各物理量的含义
3. 演示实验验证

### 课堂练习（10分钟）

学生完成练习题，教师巡视指导。

### 总结（5分钟）

回顾核心知识点，布置课后作业。

## 教学反思

注意学生对公式的理解，避免死记硬背。
"""
    
    # 使用模板服务包装 Markdown
    full_ppt_markdown = template_service.wrap_markdown_with_template(
        ppt_markdown, config, "牛顿第二定律"
    )
    
    print(f"✓ PPT Markdown 长度: {len(full_ppt_markdown)} 字符")
    print(f"✓ 教案 Markdown 长度: {len(lesson_plan_markdown)} 字符")
    
    # 3. 创建课件内容对象
    print("\n[3] 创建课件内容对象...")
    content = CoursewareContent(
        title="牛顿第二定律",
        markdown_content=full_ppt_markdown,
        lesson_plan_markdown=lesson_plan_markdown,
    )
    print(f"✓ 课件标题: {content.title}")
    
    # 4. 生成 PPTX
    print("\n[4] 生成 PPTX 文件...")
    task_id = "test-task-001"
    try:
        pptx_path = await generation_service.generate_pptx(content, task_id)
        print(f"✓ PPTX 路径: {pptx_path}")
        print(f"  （Phase 1 返回 stub 路径，Phase 2 将调用 Marp CLI）")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
    
    # 5. 生成 DOCX
    print("\n[5] 生成 DOCX 文件...")
    try:
        docx_path = await generation_service.generate_docx(content, task_id)
        print(f"✓ DOCX 路径: {docx_path}")
        print(f"  （Phase 1 返回 stub 路径，Phase 2 将调用 Pandoc）")
    except Exception as e:
        print(f"✗ 生成失败: {e}")
    
    # 6. 验证生成的 Markdown 文件
    print("\n[6] 验证生成的 Markdown 文件...")
    generated_dir = Path("generated")
    if generated_dir.exists():
        md_files = list(generated_dir.glob("*.md"))
        print(f"✓ 找到 {len(md_files)} 个 Markdown 文件:")
        for md_file in md_files:
            print(f"  - {md_file.name} ({md_file.stat().st_size} bytes)")
            
            # 显示前几行内容
            content_preview = md_file.read_text(encoding="utf-8")[:200]
            print(f"    预览: {content_preview}...")
    else:
        print("  generated/ 目录不存在")
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)
    print("\n下一步:")
    print("1. Phase 2 安装 Marp CLI: npm install -g @marp-team/marp-cli")
    print("2. Phase 2 安装 Pandoc: brew install pandoc (macOS)")
    print("3. 取消注释 generation_service.py 中的 CLI 调用代码")
    print("4. 重新运行此脚本，验证真实文件生成")


if __name__ == "__main__":
    # 运行测试
    asyncio.run(test_generation())
