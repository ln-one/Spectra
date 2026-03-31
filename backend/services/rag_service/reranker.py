"""
重排序模块

使用 Cross-Encoder 对检索结果进行精排，提升 Top1 准确率。
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from sentence_transformers import CrossEncoder

    CROSS_ENCODER_AVAILABLE = True
except ImportError:
    CROSS_ENCODER_AVAILABLE = False
    logger.warning("sentence-transformers 未安装，重排序功能不可用")


class Reranker:
    """重排序器"""

    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3"):
        """
        初始化重排序器

        Args:
            model_name: Cross-Encoder 模型名称
        """
        self.model_name = model_name
        self._model: Optional[CrossEncoder] = None

    def _load_model(self):
        """延迟加载模型"""
        if self._model is None and CROSS_ENCODER_AVAILABLE:
            try:
                self._model = CrossEncoder(self.model_name, max_length=512)
                logger.info(f"重排序模型加载成功: {self.model_name}")
            except Exception as e:
                logger.error(f"重排序模型加载失败: {e}")
                self._model = None

    def rerank(
        self, query: str, documents: list[str], top_k: int = 5
    ) -> list[tuple[int, float]]:
        """
        对文档进行重排序

        Args:
            query: 查询文本
            documents: 文档列表
            top_k: 返回前 K 个结果

        Returns:
            [(原始索引, 重排序分数), ...] 按分数降序排列
        """
        if not CROSS_ENCODER_AVAILABLE or not documents:
            return [(i, 0.0) for i in range(len(documents))]

        self._load_model()
        if self._model is None:
            return [(i, 0.0) for i in range(len(documents))]

        try:
            # 构造 (query, doc) 对
            pairs = [(query, doc) for doc in documents]

            # 计算相关性分数
            scores = self._model.predict(pairs)

            # 排序并返回 top_k
            ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
            return ranked[:top_k]

        except Exception as e:
            logger.error(f"重排序失败: {e}")
            return [(i, 0.0) for i in range(len(documents))]


# 全局单例
_reranker: Optional[Reranker] = None


def get_reranker(model_name: str = "BAAI/bge-reranker-v2-m3") -> Reranker:
    """获取重排序器单例"""
    global _reranker
    if _reranker is None:
        _reranker = Reranker(model_name)
    return _reranker
