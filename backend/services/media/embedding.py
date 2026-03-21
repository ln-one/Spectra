"""
Embedding Service - 文本向量化

支持 DashScope text-embedding-v2（主选）和 sentence-transformers 本地模型（备选）。
"""

import logging
import os
from pathlib import Path
from typing import Optional

import anyio
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-v2")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1536"))
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()

# DashScope 单次批量限制
DASHSCOPE_BATCH_LIMIT = 25


class EmbeddingService:
    """文本向量化服务"""

    def __init__(self, model: Optional[str] = None):
        """
        初始化 EmbeddingService

        Args:
            model: Embedding 模型名称，默认从环境变量读取
        """
        self._model = model or EMBEDDING_MODEL
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

    def get_dimension(self) -> int:
        """获取向量维度"""
        if self._dimension is not None:
            return self._dimension

        if self._use_dashscope():
            self._dimension = EMBEDDING_DIMENSION
        else:
            model = self._get_local_model()
            self._dimension = model.get_sentence_embedding_dimension()
        return self._dimension

    def _get_local_model(self):
        """懒加载本地 sentence-transformers 模型"""
        if self._local_model is None:
            from sentence_transformers import SentenceTransformer

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
            from dashscope import TextEmbedding

            if not DASHSCOPE_API_KEY:
                raise RuntimeError(
                    "DashScope embedding unavailable: DASHSCOPE_API_KEY not set"
                )

            all_embeddings: list[list[float]] = []

            # 分批处理，每批最多 25 条
            for i in range(0, len(texts), DASHSCOPE_BATCH_LIMIT):
                batch = texts[i : i + DASHSCOPE_BATCH_LIMIT]
                response = TextEmbedding.call(
                    model=self._model,
                    input=batch,
                    api_key=DASHSCOPE_API_KEY,
                )

                if response.status_code != 200:
                    raise RuntimeError(
                        f"DashScope embedding failed: {response.message}"
                    )

                for item in response.output["embeddings"]:
                    all_embeddings.append(item["embedding"])

            return all_embeddings

        except Exception as e:
            logger.warning(f"DashScope embedding failed, falling back to local: {e}")
            return await self._embed_local(texts)

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
