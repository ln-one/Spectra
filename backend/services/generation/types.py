"""
课件生成服务 - 数据类型定义
"""

from pydantic import BaseModel


class CoursewareContent(BaseModel):
    """
    课件内容 - GenerationService 与 AI Service 的接口契约

    AI 服务（成员 D）输出标准 Markdown 格式
    生成服务（成员 A）将 Markdown 转换为文件
    """

    title: str
    markdown_content: str  # 完整的 Markdown 内容（包含 Marp frontmatter）
    lesson_plan_markdown: str  # 教案的 Markdown 内容
