"""
模板服务 - 数据类型定义
"""

from enum import Enum

from pydantic import BaseModel


class TemplateStyle(str, Enum):
    """模板风格枚举"""

    DEFAULT = "default"  # Marp 默认主题
    GAIA = "gaia"  # Marp Gaia 主题（现代简约）
    UNCOVER = "uncover"  # Marp Uncover 主题（动态展示）
    ACADEMIC = "academic"  # 自定义学术风格


class TemplateConfig(BaseModel):
    """模板配置"""

    style: TemplateStyle = TemplateStyle.DEFAULT
    primary_color: str = "#3B82F6"  # 主题色（蓝色）
    enable_pagination: bool = True  # 是否显示页码
    enable_header: bool = False  # 是否显示页眉
    enable_footer: bool = True  # 是否显示页脚
