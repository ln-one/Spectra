"""
Embedding Service - 文本向量化

支持 DashScope text-embedding-v4 / qwen3-vl-embedding 和 sentence-transformers 本地模型（备选）。
"""

import logging
import os
from pathlib import Path
from typing import Optional

import anyio
from dotenv import load_dotenv

from utils.upstream_failures import classify_upstream_failure

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

# DashScope 单次批量限制（不同模型上限不同）
DEFAULT_DASHSCOPE_BATCH_LIMIT = 25
TEXT_EMBEDDING_V4_BATCH_LIMIT = 10
MULTIMODAL_EMBEDDING_BATCH_LIMIT = 10
_FALLBACK_LOG_MESSAGE = (
    "DashScope embedding failed for model %s; "
    "falling back to local sentence-transformers"
)
_NO_FALLBACK_LOG_MESSAGE = (
    "DashScope embedding failed for model %s; " "local fallback disabled"
)


def _resolve_embedding_model() -> str:
    return os.getenv("EMBEDDING_MODEL", "text-embedding-v4")


def _resolve_embedding_dimension() -> int:
    return int(os.getenv("EMBEDDING_DIMENSION", "1536"))


def _resolve_dashscope_api_key() -> str:
    return os.getenv("DASHSCOPE_API_KEY", "").strip()


def _allow_local_fallback() -> bool:
    value = os.getenv("EMBEDDING_ALLOW_LOCAL_FALLBACK", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


class EmbeddingService:
    """文本向量化服务"""

    def __init__(self, model: Optional[str] = None):
        """
        初始化 EmbeddingService

        Args:
            model: Embedding 模型名称，默认从环境变量读取
        """
        self._model = model if model is not None else _resolve_embedding_model()
        self._local_model = None
        self._dimension: Optional[int] = None

    def _use_dashscope(self) -> bool:
        """判断是否使用 DashScope"""
        return (self._model or "").strip().lower() not in {
            "",
            "local",
            "sentence-transformers",
            "local-sentence-transformers",
        }

    def _uses_multimodal_dashscope(self) -> bool:
        """qwen3-vl-embedding 需要走 MultiModalEmbedding 接口。"""
        return (self._model or "").strip().lower() == "qwen3-vl-embedding"

    def _dashscope_batch_limit(self) -> int:
        model_name = (self._model or "").strip().lower()
        if model_name == "qwen3-vl-embedding":
            return MULTIMODAL_EMBEDDING_BATCH_LIMIT
        if model_name == "text-embedding-v4":
            return TEXT_EMBEDDING_V4_BATCH_LIMIT
        return DEFAULT_DASHSCOPE_BATCH_LIMIT

    def get_dimension(self) -> int:
        """获取向量维度"""
        if self._dimension is not None:
            return self._dimension

        if self._use_dashscope():
            self._dimension = _resolve_embedding_dimension()
        else:
            model = self._get_local_model()
            self._dimension = model.get_sentence_embedding_dimension()
        return self._dimension

    def _get_local_model(self):
        """懒加载本地 sentence-transformers 模型"""
        if self._local_model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except Exception as exc:  # pragma: no cover - import-path specific
                raise RuntimeError(
                    "Local embedding fallback unavailable. "
                    "Install sentence-transformers and its runtime dependencies, "
                    "or configure a working remote embedding provider."
                ) from exc

            model_name = "paraphrase-multilingual-MiniLM-L12-v2"
            logger.info(f"Loading local embedding model: {model_name}")
            self._local_model = SentenceTransformer(model_name)
        return self._local_model

    async def embed_text(self, text: str) -> list[float]:
        """
        将单条文本转换为向量

        Args:
            text: 输入文本

        Returns:
            向量列表
        """
        results = await self.embed_texts([text])
        return results[0]

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        批量将文本转换为向量

        Args:
            texts: 输入文本列表

        Returns:
            向量列表的列表
        """
        if not texts:
            return []

        if self._use_dashscope():
            return await self._embed_dashscope(texts)
        return await self._embed_local(texts)

    async def _embed_dashscope(self, texts: list[str]) -> list[list[float]]:
        """使用 DashScope API 进行向量化"""
        try:
            api_key = _resolve_dashscope_api_key()
            if not api_key:
                raise RuntimeError(
                    "DashScope embedding unavailable: DASHSCOPE_API_KEY not set"
                )

            all_embeddings: list[list[float]] = []

            batch_limit = self._dashscope_batch_limit()
            for i in range(0, len(texts), batch_limit):
                batch = texts[i : i + batch_limit]
                if self._uses_multimodal_dashscope():
                    from dashscope import MultiModalEmbedding

                    response = MultiModalEmbedding.call(
                        model=self._model,
                        input=[{"text": item} for item in batch],
                        api_key=api_key,
                    )
                else:
                    from dashscope import TextEmbedding

                    response = TextEmbedding.call(
                        model=self._model,
                        input=batch,
                        api_key=api_key,
                    )

                if response.status_code != 200:
                    raise RuntimeError(
                        f"DashScope embedding failed: {response.message}"
                    )

                for item in response.output["embeddings"]:
                    all_embeddings.append(item["embedding"])

            return all_embeddings

        except Exception as e:
            fallback_enabled = _allow_local_fallback()
            logger.warning(
                _FALLBACK_LOG_MESSAGE if fallback_enabled else _NO_FALLBACK_LOG_MESSAGE,
                self._model,
                extra={
                    "embedding_model": self._model,
                    "embedding_provider": "dashscope",
                    "embedding_failure_type": classify_upstream_failure(e),
                    "fallback_used": fallback_enabled,
                    "fallback_target": (
                        "local_sentence_transformers" if fallback_enabled else None
                    ),
                    "provider_message": str(e),
                },
            )
            if fallback_enabled:
                return await self._embed_local(texts)
            raise

    def _embed_local_sync(self, texts: list[str]) -> list[list[float]]:
        """使用本地 sentence-transformers 模型进行向量化（同步）"""
        model = self._get_local_model()
        embeddings = model.encode(texts, convert_to_numpy=True)
        return [emb.tolist() for emb in embeddings]

    async def _embed_local(self, texts: list[str]) -> list[list[float]]:
        """使用本地 sentence-transformers 模型进行向量化（线程池，避免阻塞事件循环）"""
        return await anyio.to_thread.run_sync(self._embed_local_sync, texts)


# 全局实例
embedding_service = EmbeddingService()
