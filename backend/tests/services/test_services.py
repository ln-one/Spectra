import pytest


class TestFileService:
    def test_allowed_extensions(self):
        allowed = [".pdf", ".docx", ".pptx", ".txt", ".md"]
        test_files = ["doc.pdf", "slide.pptx", "note.txt"]

        for file in test_files:
            ext = "." + file.split(".")[-1]
            assert ext in allowed

    def test_disallowed_extensions(self):
        allowed = [".pdf", ".docx", ".pptx", ".txt", ".md"]
        test_files = ["script.exe", "malware.bat", "code.js"]

        for file in test_files:
            ext = "." + file.split(".")[-1]
            assert ext not in allowed


class TestDatabaseService:
    @pytest.mark.asyncio
    async def test_connection_placeholder(self):
        assert True
