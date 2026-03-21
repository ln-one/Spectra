"""
EmbeddingService 单元测试

使用 mock 避免真实 API 调用。
"""

from unittest.mock import MagicMock, patch

import pytest

from services.media.embedding import EmbeddingService


@pytest.fixture
def dashscope_svc():
    """DashScope 模式的 EmbeddingService"""
    return EmbeddingService(model="qwen3-vl-embedding")


@pytest.fixture
def local_svc():
    """本地模型模式的 EmbeddingService"""
    return EmbeddingService(model="local")


class TestEmbeddingServiceDashScope:
    """DashScope embedding 测试（mock API）"""

    def _mock_dashscope_response(self, embeddings_data):
        """构造 mock DashScope 响应"""
        resp = MagicMock()
        resp.status_code = 200
        resp.output = {"embeddings": [{"embedding": emb} for emb in embeddings_data]}
        return resp

    @pytest.mark.asyncio
    async def test_embed_single_text(self, dashscope_svc):
        fake_emb = [0.1] * 1536
        mock_resp = self._mock_dashscope_response([fake_emb])

        mock_text_embedding = MagicMock()
        mock_text_embedding.call.return_value = mock_resp

        mock_dashscope = MagicMock()
        mock_dashscope.TextEmbedding = mock_text_embedding

        with patch.dict("sys.modules", {"dashscope": mock_dashscope}):
            result = await dashscope_svc.embed_text("测试文本")
            assert len(result) == 1536
            assert mock_text_embedding.call.call_args.kwargs["api_key"]

    @pytest.mark.asyncio
    async def test_embed_dashscope_without_api_key_falls_back_to_local(self):
        svc = EmbeddingService(model="qwen3-vl-embedding")

        with (
            patch("services.media.embedding.DASHSCOPE_API_KEY", ""),
            patch.object(
                svc,
                "_embed_local",
                return_value=[[0.2] * 384],
            ) as local_mock,
        ):
            result = await svc.embed_texts(["测试文本"])

        assert len(result[0]) == 384
        local_mock.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_embed_empty_list(self, dashscope_svc):
        result = await dashscope_svc.embed_texts([])
        assert result == []

    def test_dimension_dashscope(self, dashscope_svc):
        assert dashscope_svc.get_dimension() == 1536

    def test_use_dashscope_flag(self, dashscope_svc):
        assert dashscope_svc._use_dashscope() is True


class TestEmbeddingServiceLocal:
    """本地模型 embedding 测试"""

    def test_use_dashscope_flag_false(self, local_svc):
        assert local_svc._use_dashscope() is False

    @pytest.mark.asyncio
    async def test_embed_local_with_mock(self, local_svc):
        """mock 本地模型避免下载"""
        import numpy as np

        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([[0.1] * 384, [0.2] * 384])
        mock_model.get_sentence_embedding_dimension.return_value = 384
        local_svc._local_model = mock_model

        result = await local_svc.embed_texts(["文本1", "文本2"])
        assert len(result) == 2
        assert len(result[0]) == 384

    def test_dimension_local_with_mock(self, local_svc):
        mock_model = MagicMock()
        mock_model.get_sentence_embedding_dimension.return_value = 384
        local_svc._local_model = mock_model

        assert local_svc.get_dimension() == 384
