"""Tests for filename utilities."""

from utils.filename_utils import safe_filename_for_header, sanitize_filename


class TestSanitizeFilename:
    """Test filename sanitization."""

    def test_normal_filename(self):
        """Test normal ASCII filename."""
        result = sanitize_filename("my_project_123")
        assert result == "my_project_123"

    def test_dangerous_characters(self):
        """Test removal of dangerous characters."""
        result = sanitize_filename('test<>:"/\\|?*file')
        assert result == "test_________file"

    def test_control_characters(self):
        """Test removal of control characters."""
        result = sanitize_filename("test\nfile\tname\r")
        assert result == "testfilename"

    def test_empty_filename(self):
        """Test empty filename handling."""
        result = sanitize_filename("")
        assert result == "file"

    def test_whitespace_only(self):
        """Test whitespace-only filename."""
        result = sanitize_filename("   ")
        assert result == "file"

    def test_length_limit(self):
        """Test length limiting."""
        long_name = "a" * 200
        result = sanitize_filename(long_name, max_length=50)
        assert len(result) == 50
        assert result == "a" * 50


class TestSafeFilenameForHeader:
    """Test HTTP header-safe filename generation."""

    def test_ascii_filename(self):
        """Test ASCII filename passes through."""
        result = safe_filename_for_header("test_file")
        assert result == "test_file"

    def test_chinese_filename(self):
        """Test Chinese characters get encoded."""
        result = safe_filename_for_header("课件测试")
        assert result.startswith("UTF-8''")
        assert "课件测试" not in result  # Should be encoded

    def test_mixed_filename(self):
        """Test mixed ASCII and non-ASCII."""
        result = safe_filename_for_header("test_课件_123")
        assert result.startswith("UTF-8''")

    def test_dangerous_chars_with_chinese(self):
        """Test dangerous chars are cleaned before encoding."""
        result = safe_filename_for_header('课件"测试\n/')
        # Should clean dangerous chars first, then encode
        assert result.startswith("UTF-8''")
        assert '"' not in result
        assert "\n" not in result

    def test_empty_after_cleaning(self):
        """Test fallback when filename becomes empty after cleaning."""
        result = safe_filename_for_header('"""')
        assert result == "file"
