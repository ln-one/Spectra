"""
RAG Schemas - RAG 检索相关 Pydantic 模型

对齐 docs/openapi.yaml 中的 RAG 相关 Schema 定义。
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schemas.common import SourceType, normalize_source_type


class RAGFilters(BaseModel):
    """RAG 检索过滤条件"""

    file_types: Optional[list[str]] = Field(
        None, description="文件类型过滤 (pdf/word/video/image/ppt)"
    )
    file_ids: Optional[list[str]] = Field(None, description="文件 ID 过滤")


class PromptSuggestionSurface(str, Enum):
    """Frontend surfaces that can request RAG-conditioned generation prompts."""

    PPT_GENERATION_CONFIG = "ppt_generation_config"
    STUDIO_MINDMAP = "studio_mindmap"
    STUDIO_GAME = "studio_game"
    STUDIO_QUIZ = "studio_quiz"
    STUDIO_ANIMATION = "studio_animation"
    STUDIO_SIMULATION = "studio_simulation"
    STUDIO_SPEAKER_NOTES = "studio_speaker_notes"
    STUDIO_WORD = "studio_word"


class PromptSuggestionRequest(BaseModel):
    """Request for model-generated prompts grounded in project RAG."""

    project_id: str = Field(..., description="项目 ID")
    surface: PromptSuggestionSurface = Field(..., description="调用场景")
    seed_text: Optional[str] = Field(None, max_length=1000, description="用户当前输入")
    limit: int = Field(default=4, ge=1, le=8, description="返回建议数量")
    cursor: Optional[int] = Field(None, ge=0, description="提示池分页游标")
    refresh: bool = Field(False, description="是否请求刷新该工具提示池")
    filters: Optional[RAGFilters] = Field(None, description="RAG 检索过滤条件")


class PromptSuggestionStatus(str, Enum):
    """Tool prompt pool state."""

    READY = "ready"
    GENERATING = "generating"
    STALE = "stale"
    FAILED = "failed"
    EMPTY = "empty"


class PromptSuggestionData(BaseModel):
    """Prompt suggestion response payload."""

    suggestions: list[str] = Field(default_factory=list, description="生成提示建议")
    summary: Optional[str] = Field(None, description="建议方向摘要")
    rag_hit: bool = Field(False, description="是否命中 RAG")
    status: PromptSuggestionStatus = Field(
        PromptSuggestionStatus.EMPTY, description="提示池状态"
    )
    pool_size: int = Field(0, description="该工具提示池总量")
    generated_at: Optional[str] = Field(None, description="提示池生成时间")
    next_cursor: Optional[int] = Field(None, description="下一批提示游标")


class RAGSearchRequest(BaseModel):
    """RAG 检索请求"""

    project_id: str = Field(..., description="项目 ID")
    query: str = Field(..., min_length=1, max_length=1000, description="检索查询")
    top_k: int = Field(default=5, ge=1, le=20, description="返回结果数量")
    filters: Optional[RAGFilters] = Field(None, description="过滤条件")


class SourceReference(BaseModel):
    """来源引用"""

    chunk_id: str = Field(..., description="分块 ID")
    source_type: SourceType = Field(..., description="来源类型")
    filename: str = Field(..., description="文件名")
    page_number: Optional[int] = Field(None, description="文档页码")
    timestamp: Optional[float] = Field(None, description="视频时间戳（秒）")
    preview_text: Optional[str] = Field(None, description="来源片段预览文本")

    @field_validator("source_type", mode="before")
    @classmethod
    def _normalize_source_type(cls, value):
        return normalize_source_type(value)


class RAGResult(BaseModel):
    """RAG 检索结果项"""

    chunk_id: str = Field(..., description="分块 ID")
    content: str = Field(..., description="检索到的文本片段")
    score: float = Field(..., description="相似度分数")
    source: SourceReference = Field(..., description="来源引用")
    metadata: Optional[dict] = Field(None, description="额外元数据")


class ChunkContext(BaseModel):
    """分块上下文（前后分块）"""

    previous_chunk: Optional[str] = Field(None, description="前一个分块内容")
    next_chunk: Optional[str] = Field(None, description="后一个分块内容")


class SourceDetail(BaseModel):
    """来源详情（用于 /rag/sources/{chunk_id} 响应的 data 部分）"""

    chunk_id: str
    content: str
    source: SourceReference
    context: Optional[ChunkContext] = None
    file_info: Optional[dict] = None


class RAGIndexRequest(BaseModel):
    """RAG 索引请求"""

    file_id: str = Field(..., description="要索引的文件 ID")
    chunk_size: int = Field(default=512, description="分块大小")
    chunk_overlap: int = Field(default=50, description="分块重叠大小")


class RAGSimilarRequest(BaseModel):
    """RAG 相似内容查找请求"""

    project_id: str = Field(..., description="项目 ID")
    text: str = Field(..., min_length=1, description="要查找相似内容的文本")
    top_k: int = Field(default=5, ge=1, le=20, description="返回结果数量")
    threshold: float = Field(default=0.7, ge=0, le=1, description="相似度阈值")
