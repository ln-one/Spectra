"""
查询改写模块

将口语化查询改写为检索友好的关键词查询，提升向量检索准确率。
"""

import logging

logger = logging.getLogger(__name__)

REWRITE_PROMPT = """你是一个查询改写专家。用户会输入口语化的问题，你需要将其改写为适合向量检索的关键词查询。

改写规则：
1. 提取核心关键词，去除口语化表达（"这个"、"怎么"、"是什么"等）
2. 保留领域术语和专有名词
3. 添加同义词或相关术语扩展查询
4. 输出简洁的关键词组合，用空格分隔

示例：
输入：这个项目的核心目标是什么
输出：项目目标 核心功能 背景 需求

输入：如何实现多模态交互
输出：多模态交互 实现方案 技术架构 语音 文字 图像

输入：RAG检索的准确率怎么提升
输出：RAG检索 准确率优化 重排序 查询改写 混合检索

现在请改写以下查询（只输出改写后的关键词，不要解释）：
{query}"""


async def rewrite_query(query: str, provider_name: str = "openai") -> str:
    """
    使用 LLM 改写查询

    Args:
        query: 原始查询
        provider_name: AI 提供商名称

    Returns:
        改写后的查询，失败时返回原查询
    """
    try:
        # 延迟导入避免循环依赖
        from services.ai.providers import get_provider

        provider = get_provider(provider_name)
        prompt = REWRITE_PROMPT.format(query=query)

        response = await provider.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=100,
        )

        rewritten = response.strip()
        if not rewritten or len(rewritten) > 200:
            logger.warning(f"查询改写异常，使用原查询: {query}")
            return query

        logger.info(f"查询改写: {query} -> {rewritten}")
        return rewritten

    except Exception as e:
        logger.error(f"查询改写失败: {e}，使用原查询")
        return query
