from __future__ import annotations

import io
import zipfile

import httpx
import pytest

from services.parsers.base import ProviderNotAvailableError
from services.parsers.mineru_cloud_provider import MineruCloudProvider


def _build_zip_bytes(markdown: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("full.md", markdown)
    return buffer.getvalue()


class _FakeResponse:
    def __init__(self, *, status_code: int = 200, json_data=None, content: bytes = b""):
        self.status_code = status_code
        self._json_data = json_data
        self.content = content

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error",
                request=httpx.Request("GET", "https://mineru.net"),
                response=httpx.Response(self.status_code),
            )

    def json(self):
        return self._json_data


class _FakeMineruClient:
    def __init__(self, *args, **kwargs):
        self.get_calls: list[str] = []
        self.post_calls: list[str] = []
        self.put_calls: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url, headers=None, json=None):
        self.post_calls.append(url)
        return _FakeResponse(
            json_data={
                "code": 0,
                "data": {
                    "batch_id": "batch-1",
                    "file_urls": ["https://upload.example/file.pdf"],
                },
            }
        )

    def put(self, url, content=None):
        self.put_calls.append(url)
        return _FakeResponse(status_code=200)

    def get(self, url, headers=None):
        self.get_calls.append(url)
        if url.endswith("/api/v4/extract-results/batch/batch-1"):
            return _FakeResponse(
                json_data={
                    "code": 0,
                    "data": {
                        "extract_result": [
                            {
                                "state": "done",
                                "full_zip_url": "https://download.example/full.zip",
                                "extract_progress": {"total_pages": 3},
                            }
                        ]
                    },
                }
            )
        if url == "https://download.example/full.zip":
            return _FakeResponse(content=_build_zip_bytes("# Title\n\ncloud result"))
        raise AssertionError(f"unexpected GET url: {url}")


def test_mineru_cloud_provider_requires_token_when_dualweave_disabled(monkeypatch):
    monkeypatch.delenv("MINERU_CLOUD_API_TOKEN", raising=False)
    with pytest.raises(ProviderNotAvailableError):
        MineruCloudProvider()


def test_mineru_cloud_provider_happy_path_direct_cloud(monkeypatch, tmp_path):
    monkeypatch.setenv("MINERU_CLOUD_API_TOKEN", "token")
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.httpx.Client",
        _FakeMineruClient,
    )

    file_path = tmp_path / "demo.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")

    provider = MineruCloudProvider()
    text, details = provider.extract_text(str(file_path), "demo.pdf", "pdf")

    assert "cloud result" in text
    assert details["pages_extracted"] == 3
    assert details["text_length"] == len(text)
    assert details["provider_error"] is None
