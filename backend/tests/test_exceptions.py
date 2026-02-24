"""
自定义异常类测试

测试所有自定义异常的创建、序列化和继承关系
"""

from utils.generation_exceptions import (
    FileSystemError,
    GenerationError,
    TimeoutError,
    ToolExecutionError,
    ToolNotFoundError,
    ValidationError,
)


class TestGenerationError:
    """测试 GenerationError 基类"""

    def test_basic_error(self):
        """测试基础错误创建"""
        error = GenerationError("Test error")

        assert str(error) == "Test error"
        assert error.error_code == "GENERATION_ERROR"
        assert error.details == {}

    def test_error_with_code_and_details(self):
        """测试带错误码和详情的错误"""
        details = {"key": "value", "number": 42}
        error = GenerationError("Custom error", "CUSTOM_ERROR", details)

        assert error.message == "Custom error"
        assert error.error_code == "CUSTOM_ERROR"
        assert error.details == details

    def test_error_to_dict(self):
        """测试错误转换为字典"""
        error = GenerationError("Test error", "TEST_ERROR", {"detail": "info"})
        error_dict = error.to_dict()

        assert error_dict["error"] == "TEST_ERROR"
        assert error_dict["message"] == "Test error"
        assert error_dict["details"]["detail"] == "info"


class TestToolNotFoundError:
    """测试工具未安装错误"""

    def test_tool_not_found_basic(self):
        """测试基础工具未找到错误"""
        error = ToolNotFoundError("marp")

        assert "marp" in str(error)
        assert "not installed" in str(error)
        assert error.error_code == "TOOL_NOT_FOUND"
        assert error.details["tool"] == "marp"

    def test_tool_not_found_with_install_command(self):
        """测试带安装命令的错误"""
        error = ToolNotFoundError("pandoc", "brew install pandoc")
        assert error.details["install_command"] == "brew install pandoc"

    def test_tool_not_found_to_dict(self):
        """测试错误序列化"""
        error = ToolNotFoundError("marp", "npm install -g @marp-team/marp-cli")
        error_dict = error.to_dict()

        assert error_dict["error"] == "TOOL_NOT_FOUND"
        assert error_dict["details"]["tool"] == "marp"
        assert "npm install" in error_dict["details"]["install_command"]


class TestToolExecutionError:
    """测试工具执行错误"""

    def test_tool_execution_basic(self):
        """测试基础执行错误"""
        error = ToolExecutionError("marp", "Error: Invalid markdown", 1)

        assert "marp" in str(error)
        assert "execution failed" in str(error)
        assert error.error_code == "TOOL_EXECUTION_ERROR"

    def test_tool_execution_details(self):
        """测试执行错误详情"""
        stderr = "Error: File not found\nLine 10: Syntax error"
        error = ToolExecutionError("pandoc", stderr, 2)

        assert error.details["tool"] == "pandoc"
        assert error.details["stderr"] == stderr
        assert error.details["return_code"] == 2

    def test_tool_execution_to_dict(self):
        """测试错误序列化"""
        error = ToolExecutionError("marp", "Error message", 1)
        error_dict = error.to_dict()

        assert error_dict["error"] == "TOOL_EXECUTION_ERROR"
        assert error_dict["details"]["stderr"] == "Error message"


class TestFileSystemError:
    """测试文件系统错误"""

    def test_filesystem_error_basic(self):
        """测试基础文件系统错误"""
        error = FileSystemError("write", "/tmp/test.txt", "Permission denied")

        assert "write" in str(error)
        assert error.error_code == "FILE_SYSTEM_ERROR"

    def test_filesystem_error_details(self):
        """测试文件系统错误详情"""
        error = FileSystemError("read", "/path/to/file.md", "File not found")

        assert error.details["operation"] == "read"
        assert error.details["path"] == "/path/to/file.md"
        assert error.details["reason"] == "File not found"

    def test_filesystem_error_to_dict(self):
        """测试错误序列化"""
        error = FileSystemError("delete", "/tmp/file", "No such file")
        error_dict = error.to_dict()

        assert error_dict["error"] == "FILE_SYSTEM_ERROR"
        assert error_dict["details"]["operation"] == "delete"


class TestValidationError:
    """测试输入验证错误"""

    def test_validation_error_basic(self):
        """测试基础验证错误"""
        error = ValidationError("title", "Title is too long")

        assert "title" in str(error)
        assert error.error_code == "VALIDATION_ERROR"

    def test_validation_error_details(self):
        """测试验证错误详情"""
        error = ValidationError("markdown_content", "Content exceeds 1MB limit")

        assert error.details["field"] == "markdown_content"
        assert error.details["reason"] == "Content exceeds 1MB limit"

    def test_validation_error_to_dict(self):
        """测试错误序列化"""
        error = ValidationError("email", "Invalid email format")
        error_dict = error.to_dict()

        assert error_dict["error"] == "VALIDATION_ERROR"
        assert error_dict["details"]["field"] == "email"


class TestTimeoutError:
    """测试超时错误"""

    def test_timeout_error_basic(self):
        """测试基础超时错误"""
        error = TimeoutError("PPTX generation", 300)

        assert "timeout" in str(error).lower()
        assert error.error_code == "TIMEOUT_ERROR"

    def test_timeout_error_details(self):
        """测试超时错误详情"""
        error = TimeoutError("Pandoc conversion", 120)

        assert error.details["operation"] == "Pandoc conversion"
        assert error.details["timeout_seconds"] == 120

    def test_timeout_error_to_dict(self):
        """测试错误序列化"""
        error = TimeoutError("File generation", 60)
        error_dict = error.to_dict()

        assert error_dict["error"] == "TIMEOUT_ERROR"
        assert error_dict["details"]["timeout_seconds"] == 60


class TestErrorInheritance:
    """测试错误继承关系"""

    def test_all_errors_inherit_from_generation_error(self):
        """测试所有错误都继承自 GenerationError"""
        errors = [
            ToolNotFoundError("test"),
            ToolExecutionError("test", "error", 1),
            FileSystemError("op", "path", "reason"),
            ValidationError("field", "reason"),
            TimeoutError("op", 60),
        ]

        for error in errors:
            assert isinstance(error, GenerationError)
            assert isinstance(error, Exception)

    def test_all_errors_have_to_dict(self):
        """测试所有错误都有 to_dict 方法"""
        errors = [
            ToolNotFoundError("test"),
            ToolExecutionError("test", "error", 1),
            FileSystemError("op", "path", "reason"),
            ValidationError("field", "reason"),
            TimeoutError("op", 60),
        ]

        for error in errors:
            error_dict = error.to_dict()
            assert "error" in error_dict
            assert "message" in error_dict
            assert "details" in error_dict


class TestErrorMessages:
    """测试错误消息"""

    def test_error_messages_are_descriptive(self):
        """测试错误消息是否描述清晰"""
        errors = [
            (ToolNotFoundError("marp"), ["marp", "not installed"]),
            (ToolExecutionError("pandoc", "stderr", 1), ["pandoc", "failed"]),
            (FileSystemError("write", "/path", "denied"), ["write", "error"]),
            (ValidationError("title", "too long"), ["title", "validation"]),
            (TimeoutError("generation", 300), ["timeout", "generation"]),
        ]

        for error, keywords in errors:
            message = str(error).lower()
            for keyword in keywords:
                assert keyword.lower() in message

    def test_error_details_are_complete(self):
        """测试错误详情是否完整"""
        error = ToolExecutionError("marp", "Error output", 2)

        assert "tool" in error.details
        assert "stderr" in error.details
        assert "return_code" in error.details
        assert error.details["tool"] == "marp"
        assert error.details["stderr"] == "Error output"
        assert error.details["return_code"] == 2
