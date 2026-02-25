"""
RAG Schemas - RAG 检索相关 Pydantic 模型

对齐 docs/openapi.yaml 中的 RAG 相关 Schema 定义。
"""

from typing import Optional

from pydantic import BaseModel, Field


class RAGFilters(BaseModel):
    """RAG 检索过滤条件"""

    file_types: Optional[list[str]] = Field(
        None, description="文件类型过滤 (pdf/word/video/image/ppt)"
    )
    file_ids: Optional[list[str]] = Field(None, description="文件 ID 过滤")


class RAGSearchRequest(BaseModel):
    """RAG 检索请求"""

    project_id: str = Field(..., description="项目 ID")
    query: str = Field(..., min_length=1, max_length=1000, description="检索查询")
    top_k: int = Field(default=5, ge=1, le=20, description="返回结果数量")
    filters: Optional[RAGFilters] = Field(None, description="过滤条件")


class SourceReference(BaseModel):
    """来源引用"""

    chunk_id: str = Field(..., description="分块 ID")
    source_type: str = Field(..., description="来源类型 (video/document/ai_generated)")
    filename: str = Field(..., description="文件名")
    page_number: Optional[int] = Field(None, description="文档页码")
    timestamp: Optional[str] = Field(None, description="视频时间戳")
    preview_text: Optional[str] = Field(None, description="来源片段预览文本")


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
    threshold: float = Field(
        default=0.7, ge=0, le=1, description="相似度阈值"
    )
