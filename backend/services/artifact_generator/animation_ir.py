"""
Animation Intermediate Representation (IR)

LLM 生成 AnimationPlan（JSON），确定性编译器将其转换为 Manim v0.18.1 代码。
这样可以从根源消灭 API 幻觉，只在编译器层处理版本差异。
"""

from typing import Literal, Any, Union
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# Scene Metadata
# ============================================================================

class SceneMeta(BaseModel):
    """场景元信息"""
    title: str = Field(description="动画主标题")
    subtitle: str | None = Field(default=None, description="副标题（可选）")
    duration_seconds: int = Field(default=8, description="总时长（秒）")
    background_gradient: list[str] = Field(
        default=["#0a0e27", "#1a1e3a"],
        description="背景渐变色（两个十六进制颜色）"
    )


# ============================================================================
# Visual Objects
# ============================================================================

class VisualObject(BaseModel):
    """可视化对象定义"""
    id: str = Field(description="对象唯一标识符，用于后续引用")
    type: Literal["box", "circle", "arrow", "text", "dot"] = Field(
        description="对象类型"
    )
    label: str | None = Field(default=None, description="对象上的文字标签")
    color: str = Field(default="BLUE", description="颜色（Manim 颜色常量名）")
    position: Union[list[float], str] = Field(
        default=[0, 0],
        description="初始位置：[x, y] 或 'left'/'right'/'top'/'bottom'/'center'"
    )
    size: dict[str, float] | None = Field(
        default=None,
        description="尺寸参数，如 {width: 2.5, height: 1.5} 或 {radius: 0.5}"
    )
    style: dict[str, Any] = Field(
        default_factory=dict,
        description="样式参数，如 {fill_opacity: 0.3, corner_radius: 0.2}"
    )

    @field_validator("position", mode="before")
    @classmethod
    def normalize_position(cls, v):
        """Convert string position aliases to [x, y] coordinates."""
        if isinstance(v, str):
            position_map = {
                "left": [-4, 0],
                "right": [4, 0],
                "top": [0, 2],
                "bottom": [0, -2],
                "center": [0, 0],
                "middle": [0, 0],
            }
            return position_map.get(v.lower(), [0, 0])
        elif isinstance(v, list) and len(v) == 2:
            # Handle ["center", "middle"] -> [0, 0]
            if isinstance(v[0], str) or isinstance(v[1], str):
                x = {"left": -4, "right": 4, "center": 0}.get(str(v[0]).lower(), 0)
                y = {"top": 2, "bottom": -2, "middle": 0, "center": 0}.get(str(v[1]).lower(), 0)
                return [x, y]
        return v


# ============================================================================
# Timeline Steps
# ============================================================================

class AnimationAction(BaseModel):
    """单个动画动作"""
    type: Literal[
        "create", "fade_in", "fade_out", "write", "grow_arrow",
        "move_to", "highlight", "indicate", "flash", "transform"
    ] = Field(description="动画类型")
    target: str | list[str] = Field(
        description="目标对象 ID（单个或多个）"
    )
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="动画参数，如 {run_time: 0.5, shift: [1, 0]}"
    )
    lag_ratio: float | None = Field(
        default=None,
        description="如果是多对象，LaggedStart 的 lag_ratio"
    )


class TimelineStep(BaseModel):
    """时间线上的一个步骤"""
    description: str = Field(description="步骤描述（用于日志）")
    actions: list[AnimationAction] = Field(description="并行执行的动画动作列表")
    wait_after: float = Field(default=0.3, description="步骤后等待时间（秒）")


# ============================================================================
# Transitions
# ============================================================================

class SceneTransition(BaseModel):
    """场景转场"""
    type: Literal["fade_out_all", "clear", "replace"] = Field(
        description="转场类型"
    )
    targets: list[str] | None = Field(
        default=None,
        description="如果是 replace，指定要替换的对象 ID"
    )
    duration: float = Field(default=0.5, description="转场时长（秒）")


# ============================================================================
# Text Blocks
# ============================================================================

class TextBlock(BaseModel):
    """独立文本块（如说明文字、总结）"""
    id: str = Field(description="文本块 ID")
    content: str = Field(description="文本内容")
    position: Literal["top", "bottom", "left", "right", "center"] = Field(
        description="位置"
    )
    color: str = Field(default="WHITE", description="颜色")
    font_size: int = Field(default=24, description="字号")
    offset: list[float] = Field(
        default=[0, 0],
        description="相对位置的偏移 [x, y]"
    )


# ============================================================================
# Complete Animation Plan
# ============================================================================

class AnimationPlan(BaseModel):
    """完整的动画计划（LLM 生成的 IR）"""
    scene_meta: SceneMeta = Field(description="场景元信息")
    objects: list[VisualObject] = Field(description="所有可视化对象定义")
    timeline: list[TimelineStep] = Field(description="时间线步骤序列")
    transitions: list[SceneTransition] = Field(
        default_factory=list,
        description="场景转场（可选）"
    )
    text_blocks: list[TextBlock] = Field(
        default_factory=list,
        description="独立文本块（可选）"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "scene_meta": {
                    "title": "HTTP 请求响应流程",
                    "subtitle": "客户端与服务器的交互",
                    "duration_seconds": 8,
                    "background_gradient": ["#0a1628", "#0d2137"]
                },
                "objects": [
                    {
                        "id": "client",
                        "type": "box",
                        "label": "浏览器",
                        "color": "TEAL",
                        "position": [-4, -0.3],
                        "size": {"width": 2.8, "height": 1.6},
                        "style": {"fill_opacity": 0.3, "corner_radius": 0.2}
                    },
                    {
                        "id": "server",
                        "type": "box",
                        "label": "服务器",
                        "color": "BLUE",
                        "position": [4, -0.3],
                        "size": {"width": 2.8, "height": 1.6},
                        "style": {"fill_opacity": 0.3, "corner_radius": 0.2}
                    }
                ],
                "timeline": [
                    {
                        "description": "显示客户端和服务器",
                        "actions": [
                            {
                                "type": "fade_in",
                                "target": ["client", "server"],
                                "params": {"shift": [0.3, 0]},
                                "lag_ratio": 0.2
                            }
                        ],
                        "wait_after": 0.3
                    }
                ],
                "text_blocks": [
                    {
                        "id": "summary",
                        "content": "一次完整的 HTTP 交互完成",
                        "position": "bottom",
                        "color": "WHITE",
                        "font_size": 26,
                        "offset": [0, 0.5]
                    }
                ]
            }
        }
