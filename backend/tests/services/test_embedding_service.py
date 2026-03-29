"""
EmbeddingService 单元测试

使用 mock 避免真实 API 调用。
"""

import logging
import os
from unittest.mock import MagicMock, patch

import pytest

from services.media.embedding import EmbeddingService


@pytest.fixture
def dashscope_svc():
    """DashScope 模式的 EmbeddingService。"""
    return EmbeddingService(model="text-embedding-v4")


@pytest.fixture
def dashscope_text_svc():
    """DashScope TextEmbedding 模式的 EmbeddingService。"""
    return EmbeddingService(model="text-embedding-v4")


@pytest.fixture
def local_svc():
    """本地模型模式的 EmbeddingService。"""
    return EmbeddingService(model="local")


class TestEmbeddingServiceDashScope:
    """DashScope embedding tests with mocked API calls."""

    def _mock_dashscope_response(self, embeddings_data):
        """Build a mocked DashScope response payload."""
        resp = MagicMock()
        resp.status_code = 200
        resp.output = {"embeddings": [{"embedding": emb} for emb in embeddings_data]}
        return resp

    @pytest.mark.asyncio
    async def test_embed_single_text_with_text_embedding(self, dashscope_svc):
        fake_emb = [0.1] * 1536
        mock_resp = self._mock_dashscope_response([fake_emb])

        mock_text_embedding = MagicMock()
        mock_text_embedding.call.return_value = mock_resp

        mock_dashscope = MagicMock()
        mock_dashscope.TextEmbedding = mock_text_embedding

        with (
            patch.dict("sys.modules", {"dashscope": mock_dashscope}),
            patch(
                "services.media.embedding._resolve_dashscope_api_key",
                return_value="sk-test",
            ),
        ):
            result = await dashscope_svc.embed_text("测试文本")
            assert len(result) == 1536
            assert mock_text_embedding.call.call_args.kwargs["api_key"]
            assert mock_text_embedding.call.call_args.kwargs["input"] == ["测试文本"]

    @pytest.mark.asyncio
    async def test_embed_single_text_with_multimodal(self):
        fake_emb = [0.1] * 1536
        mock_resp = self._mock_dashscope_response([fake_emb])

        svc = EmbeddingService(model="qwen3-vl-embedding")
        mock_multimodal_embedding = MagicMock()
        mock_multimodal_embedding.call.return_value = mock_resp

        mock_dashscope = MagicMock()
        mock_dashscope.MultiModalEmbedding = mock_multimodal_embedding

        with (
            patch.dict("sys.modules", {"dashscope": mock_dashscope}),
            patch(
                "services.media.embedding._resolve_dashscope_api_key",
                return_value="sk-test",
            ),
        ):
            result = await svc.embed_text("测试文本")
            assert len(result) == 1536
            assert mock_multimodal_embedding.call.call_args.kwargs["api_key"]
            assert mock_multimodal_embedding.call.call_args.kwargs["input"] == [
                {"text": "测试文本"}
            ]

    @pytest.mark.asyncio
    async def test_embed_dashscope_without_api_key_raises_by_default(self):
        svc = EmbeddingService(model="text-embedding-v4")

        with (
            patch(
                "services.media.embedding._resolve_dashscope_api_key", return_value=""
            ),
            patch.object(
                svc,
                "_embed_local",
                return_value=[[0.2] * 384],
            ) as local_mock,
        ):
            with pytest.raises(RuntimeError):
                await svc.embed_texts(["测试文本"])

        local_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_embed_dashscope_fallback_logs_structured_failure(self, caplog):
        svc = EmbeddingService(model="text-embedding-v4")

        with (
            patch.dict("os.environ", {"EMBEDDING_ALLOW_LOCAL_FALLBACK": "true"}),
            patch(
                "services.media.embedding._resolve_dashscope_api_key", return_value=""
            ),
            patch.object(
                svc,
                "_embed_local",
                return_value=[[0.2] * 384],
            ),
            caplog.at_level(logging.WARNING),
        ):
            await svc.embed_texts(["测试文本"])

        record = next(
            record
            for record in caplog.records
            if record.msg
            == "DashScope embedding failed for model %s; falling back to local sentence-transformers"
        )
        assert record.embedding_model == "text-embedding-v4"
        assert record.embedding_provider == "dashscope"
        assert record.embedding_failure_type == "config_error"
        assert record.fallback_used is True
        assert record.fallback_target == "local_sentence_transformers"

    @pytest.mark.asyncio
    async def test_embed_dashscope_no_fallback_logs_structured_failure(self, caplog):
        svc = EmbeddingService(model="text-embedding-v4")

        with (
            patch(
                "services.media.embedding._resolve_dashscope_api_key", return_value=""
            ),
            caplog.at_level(logging.WARNING),
        ):
            with pytest.raises(RuntimeError):
                await svc.embed_texts(["测试文本"])

        record = next(
            record
            for record in caplog.records
            if record.msg
            == "DashScope embedding failed for model %s; local fallback disabled"
        )
        assert record.embedding_model == "text-embedding-v4"
        assert record.embedding_provider == "dashscope"
        assert record.embedding_failure_type == "config_error"
        assert record.fallback_used is False
        assert record.fallback_target is None

    @pytest.mark.asyncio
    async def test_embed_empty_list(self, dashscope_svc):
        result = await dashscope_svc.embed_texts([])
        assert result == []

    def test_dimension_dashscope(self, dashscope_svc):
        assert dashscope_svc.get_dimension() == int(
            os.getenv("EMBEDDING_DIMENSION", "1536")
        )

    def test_default_model_reads_env_on_init(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "qwen3-vl-embedding")
        svc = EmbeddingService()
        assert svc._uses_multimodal_dashscope() is True

    def test_default_dimension_reads_env(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_DIMENSION", "1024")
        svc = EmbeddingService(model="text-embedding-v4")
        assert svc.get_dimension() == 1024

    def test_use_dashscope_flag(self, dashscope_svc):
        assert dashscope_svc._use_dashscope() is True

    def test_text_embedding_v4_is_treated_as_dashscope(self):
        svc = EmbeddingService(model="text-embedding-v4")
        assert svc._use_dashscope() is True

    def test_qwen3_vl_embedding_uses_multimodal_interface(self):
        svc = EmbeddingService(model="qwen3-vl-embedding")
        assert svc._uses_multimodal_dashscope() is True

    def test_text_embedding_v4_uses_batch_limit_10(self):
        svc = EmbeddingService(model="text-embedding-v4")
        assert svc._dashscope_batch_limit() == 10

    def test_qwen3_vl_embedding_uses_batch_limit_10(self):
        svc = EmbeddingService(model="qwen3-vl-embedding")
        assert svc._dashscope_batch_limit() == 10

    @pytest.mark.asyncio
    async def test_embed_text_truncates_long_input_before_dashscope_call(self):
        fake_emb = [0.1] * 1536
        mock_resp = self._mock_dashscope_response([fake_emb])

        mock_text_embedding = MagicMock()
        mock_text_embedding.call.return_value = mock_resp

        mock_dashscope = MagicMock()
        mock_dashscope.TextEmbedding = mock_text_embedding
        long_text = "x" * 3000

        with (
            patch.dict("sys.modules", {"dashscope": mock_dashscope}),
            patch(
                "services.media.embedding._resolve_dashscope_api_key",
                return_value="sk-test",
            ),
            patch.dict("os.environ", {"EMBEDDING_DASHSCOPE_MAX_INPUT_CHARS": "2000"}),
        ):
            svc = EmbeddingService(model="text-embedding-v2")
            result = await svc.embed_text(long_text)
            assert len(result) == 1536

        called_input = mock_text_embedding.call.call_args.kwargs["input"][0]
        assert len(called_input) == 2000


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
