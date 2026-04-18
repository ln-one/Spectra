"""Animation spec constants."""

from __future__ import annotations

import re

DEFAULT_THEME = {
    "background": "#f5f8f3",
    "panel": "#ffffff",
    "panel_alt": "#e8f6ee",
    "accent": "#16a34a",
    "accent_soft": "#86efac",
    "accent_deep": "#166534",
    "text": "#10231a",
    "muted": "#5f7668",
    "grid": "#d8e7dc",
    "highlight": "#f59e0b",
}

_TEACHING_PPT_CARTOON_THEME = {
    "background": "#f3c453",
    "panel": "#fff1cc",
    "panel_alt": "#f7d98b",
    "accent": "#1f7a5c",
    "accent_soft": "#63b99a",
    "accent_deep": "#17334e",
    "text": "#1f2430",
    "muted": "#5f4f3d",
    "grid": "#e8c978",
    "highlight": "#c2663f",
}

_TEACHING_PPT_DEEP_BLUE_THEME = {
    "background": "#dfeaf6",
    "panel": "#f5f9ff",
    "panel_alt": "#d3e2f6",
    "accent": "#2f6da5",
    "accent_soft": "#7fb2da",
    "accent_deep": "#0f2f4f",
    "text": "#12324d",
    "muted": "#5d7387",
    "grid": "#c4d5e6",
    "highlight": "#2fa8c2",
}

_TEACHING_PPT_WARM_ORANGE_THEME = {
    "background": "#f7e9d8",
    "panel": "#fff5ea",
    "panel_alt": "#f7dcc2",
    "accent": "#ce7a32",
    "accent_soft": "#f2b87d",
    "accent_deep": "#8d4c1f",
    "text": "#4a2a16",
    "muted": "#7a5f4b",
    "grid": "#e7cdb5",
    "highlight": "#d64545",
}

_TEACHING_PPT_MINIMAL_GRAY_THEME = {
    "background": "#eef1f4",
    "panel": "#ffffff",
    "panel_alt": "#dfe5ea",
    "accent": "#5c7389",
    "accent_soft": "#a2b4c3",
    "accent_deep": "#2f3f50",
    "text": "#243240",
    "muted": "#6d7986",
    "grid": "#d1d8df",
    "highlight": "#ed8f3b",
}

_STYLE_PACK_THEMES = {
    "teaching_ppt_cartoon": _TEACHING_PPT_CARTOON_THEME,
    "teaching_ppt_fresh_green": DEFAULT_THEME,
    "teaching_ppt_deep_blue": _TEACHING_PPT_DEEP_BLUE_THEME,
    "teaching_ppt_warm_orange": _TEACHING_PPT_WARM_ORANGE_THEME,
    "teaching_ppt_minimal_gray": _TEACHING_PPT_MINIMAL_GRAY_THEME,
}

_STYLE_PACK_ALIASES = {
    "default": "teaching_ppt_minimal_gray",
    "teaching_ppt": "teaching_ppt_minimal_gray",
    "cartoon": "teaching_ppt_cartoon",
    "fresh_green": "teaching_ppt_fresh_green",
    "deep_blue": "teaching_ppt_deep_blue",
    "warm_orange": "teaching_ppt_warm_orange",
    "minimal_gray": "teaching_ppt_minimal_gray",
    "blue": "teaching_ppt_deep_blue",
    "orange": "teaching_ppt_warm_orange",
    "gray": "teaching_ppt_minimal_gray",
    # Frontend theme preset IDs
    "sunset-amber": "teaching_ppt_warm_orange",
    "sand-ochre": "teaching_ppt_warm_orange",
    "ocean-cyan": "teaching_ppt_deep_blue",
    "graphite-blue": "teaching_ppt_deep_blue",
    "forest-emerald": "teaching_ppt_fresh_green",
    "teal-mint": "teaching_ppt_fresh_green",
    "mist-zinc": "teaching_ppt_minimal_gray",
    "lavender-slate": "teaching_ppt_minimal_gray",
    "rose-wine": "teaching_ppt_warm_orange",
    "ink-sky": "teaching_ppt_deep_blue",
}

_DEFAULT_STYLE_PACK = "teaching_ppt_minimal_gray"

_VISUAL_TYPES = {"process_flow", "relationship_change", "structure_breakdown"}

_SUBJECT_FAMILIES = {
    "generic_process",
    "protocol_exchange",
    "pipeline_sequence",
    "lifecycle_cycle",
    "traversal_path",
    "energy_transfer",
    "structure_layers",
    "trend_change",
}

_LAYOUT_TYPES = {
    "two_party_sequence",
    "horizontal_pipeline",
    "cycle_stages",
    "traversal_map",
    "energy_track",
    "layer_stack",
    "trend_curve",
}

_NETWORK_LAYER_ORDER = [
    "应用层",
    "传输层",
    "网络层",
    "数据链路层",
    "物理层",
]

_OSI_LAYER_ORDER = [
    "应用层",
    "表示层",
    "会话层",
    "传输层",
    "网络层",
    "数据链路层",
    "物理层",
]

_NETWORK_LAYER_DETAILS = {
    "应用层": "直接面向用户应用，负责提供 HTTP、DNS 等网络服务。",
    "表示层": "负责数据表示、编码转换、压缩和加密，让不同系统能正确理解数据。",
    "会话层": "负责建立、维持和管理会话，让通信双方保持有序交互。",
    "传输层": "负责端到端传输，保证数据分段、复用与可靠性控制。",
    "网络层": "负责逻辑寻址与路由，让数据找到目标网络。",
    "数据链路层": "负责相邻节点间成帧、差错检测与介质访问控制。",
    "物理层": "负责把比特转换成电信号、光信号等实际介质上传输的形式。",
}

_SCENE_TRANSITIONS = {
    "cut",
    "dissolve",
    "soft_wipe",
    "blinds",
    "shutter",
    "fade",
    "slide",
    "zoom",
    "wipe",
}

_SCENE_TRANSITION_ALIASES = {
    "fade": "dissolve",
    "slide": "soft_wipe",
    "zoom": "dissolve",
    "wipe": "soft_wipe",
    "softwipe": "soft_wipe",
}

_DEFAULT_SCENE_TRANSITION_ORDER = ("cut", "dissolve", "soft_wipe", "blinds")

_SHOT_TYPES = {"intro", "focus", "summary"}

_CAMERA_TYPES = {
    "wide",
    "medium",
    "close",
    "track_left",
    "track_right",
    "zoom_in",
    "zoom_out",
}

_REQUEST_PREFIXES = (
    "请给我制作一个",
    "请给我制作",
    "请帮我制作一个",
    "请帮我制作",
    "帮我制作一个",
    "帮我制作",
    "请生成一个",
    "请生成",
    "给我做一个",
    "给我做",
    "我想做一个",
    "我想做",
    "我想要一个",
    "我想要",
    "请做一个",
    "请做",
)

_REQUEST_PATTERN = re.compile(
    r"^(请|帮我|给我|我想|想要|麻烦|请帮我|请给我).*(做|制作|生成|输出|创建).*(动画|演示|GIF|gif)",
    re.IGNORECASE,
)

_GENERIC_ANIMATION_TITLE_PATTERNS = (
    r"(?:演示|讲解|教学|科普|展示)?动画(?:演示|展示|讲解)?$",
    r"(?:演示|讲解|教学|科普|展示)?动画稿$",
    r"(?:演示|讲解|教学|科普|展示)?gif$",
    r"(?:演示|讲解|教学|科普|展示)?视频$",
    r"(?:演示|讲解|教学|科普|展示)?动图$",
    r"(?:过程|流程|原理|机制)?演示$",
    r"(?:过程|流程|原理|机制)?展示$",
    r"(?:过程|流程|原理|机制)?讲解$",
)
_GENERIC_ANIMATION_TITLE_EXACT = {
    "动画",
    "演示动画",
    "教学动画",
    "科普动画",
    "展示动画",
    "讲解动画",
    "gif",
    "gif动画",
    "动图",
    "视频",
}
