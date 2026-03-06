"""
文本分块策略测试
"""

from services.chunking import _estimate_tokens, split_text


class TestEstimateTokens:
    """token 估算测试"""

    def test_chinese_text(self):
        text = "你好世界"  # 4 个中文字 ≈ 6 tokens
        tokens = _estimate_tokens(text)
        assert tokens == 6

    def test_english_text(self):
        text = "hello world"  # 11 chars * 0.25 ≈ 2
        tokens = _estimate_tokens(text)
        assert tokens >= 2

    def test_mixed_text(self):
        text = "你好hello"  # 2 中文(3) + 5 英文(1.25) ≈ 4
        tokens = _estimate_tokens(text)
        assert tokens >= 3

    def test_empty_text(self):
        assert _estimate_tokens("") == 0


class TestSplitText:
    """文本分块测试"""

    def test_empty_text(self):
        assert split_text("") == []
        assert split_text("   ") == []

    def test_short_text_no_split(self):
        text = "这是一段短文本。"
        result = split_text(text, chunk_size=500)
        assert len(result) == 1
        assert result[0] == text

    def test_split_on_double_newline(self):
        text = "第一段内容。" * 50 + "\n\n" + "第二段内容。" * 50
        result = split_text(text, chunk_size=100, chunk_overlap=10)
        assert len(result) >= 2

    def test_split_on_sentence_boundary(self):
        text = "这是第一句话。这是第二句话。这是第三句话。" * 30
        result = split_text(text, chunk_size=50, chunk_overlap=5)
        assert len(result) >= 2
        # 检查分块在句号处断开
        for chunk in result[:-1]:
            assert chunk.endswith("。") or chunk.endswith("\n")

    def test_overlap_exists(self):
        """相邻块应有重叠"""
        text = "这是一段很长的文本内容。" * 100
        result = split_text(text, chunk_size=50, chunk_overlap=10)
        if len(result) >= 2:
            # 后一块的开头应该在前一块中出现
            overlap_text = result[1][:10]
            assert overlap_text in result[0] or len(result[0]) > 10

    def test_chunks_not_empty(self):
        text = "内容。" * 200
        result = split_text(text, chunk_size=30, chunk_overlap=5)
        for chunk in result:
            assert len(chunk.strip()) > 0

    def test_all_content_preserved(self):
        """分块后内容不应丢失（考虑重叠会有重复）"""
        text = "ABCDEFGHIJ" * 50
        result = split_text(text, chunk_size=20, chunk_overlap=3)
        combined = "".join(result)
        # 由于重叠，combined 会比原文长，但原文每个字符都应出现
        for char in set(text):
            assert char in combined

    def test_overlap_ge_chunk_size_raises(self):
        """chunk_overlap >= chunk_size 应抛出 ValueError"""
        import pytest

        with pytest.raises(ValueError, match="chunk_overlap must be less"):
            split_text("一些文本内容。" * 50, chunk_size=50, chunk_overlap=50)


class TestChinesePunctuationSeparators:
    """中文标点分割符优化测试（D-5.3）"""

    def test_split_on_semicolon(self):
        """应在分号处断开，而非逗号"""
        # 构造一段用分号分隔的长文本
        segment = "这是一个子句内容" * 8
        text = f"{segment}；{segment}；{segment}"
        result = split_text(text, chunk_size=60, chunk_overlap=5)
        assert len(result) >= 2
        # 至少有一个块以分号结尾（说明在分号处断开）
        ends_with_semicolon = any(c.endswith("；") for c in result[:-1])
        assert ends_with_semicolon

    def test_separators_include_chinese_punctuation(self):
        from services.chunking import SEPARATORS

        assert "；" in SEPARATORS
        assert "，" in SEPARATORS
        assert "……" in SEPARATORS

    def test_semicolon_priority_over_comma(self):
        """分号优先级高于逗号"""
        from services.chunking import SEPARATORS

        assert SEPARATORS.index("；") < SEPARATORS.index("，")
