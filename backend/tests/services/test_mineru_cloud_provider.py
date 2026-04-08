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


class _FakeDualweaveClient:
    def __init__(self, result: dict | None = None, error: Exception | None = None):
        self.base_url = "http://dualweave:8080"
        self.result = result or {}
        self.error = error
        self.calls: list[dict[str, str | None]] = []
        self.wait_calls = 0

    def upload_file_sync(
        self,
        *,
        filepath: str,
        filename: str,
        mime_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict:
        self.calls.append(
            {
                "filepath": filepath,
                "filename": filename,
                "mime_type": mime_type,
                "source_provider": (metadata or {}).get("source_provider"),
            }
        )
        if self.error is not None:
            raise self.error
        return self.result

    def wait_for_result_url_sync(self, result: dict) -> dict:
        self.wait_calls += 1
        return result


class _FakeZipDownloadClient:
    def __init__(self, *args, **kwargs):
        self.calls: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, headers=None):
        self.calls.append(url)
        if url == "https://example.invalid/result.zip":
            return _FakeResponse(
                content=_build_zip_bytes("# Title\n\ndualweave result")
            )
        if url == "https://example.invalid/bad.zip":
            return _FakeResponse(content=b"not-a-zip")
        raise AssertionError(f"unexpected GET url: {url}")


def test_mineru_cloud_provider_requires_token_when_dualweave_disabled(monkeypatch):
    monkeypatch.delenv("MINERU_CLOUD_API_TOKEN", raising=False)
    monkeypatch.delenv("DUALWEAVE_ENABLED", raising=False)
    with pytest.raises(ProviderNotAvailableError):
        MineruCloudProvider()


def test_mineru_cloud_provider_happy_path_direct_cloud(monkeypatch, tmp_path):
    monkeypatch.setenv("MINERU_CLOUD_API_TOKEN", "token")
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.build_dualweave_client",
        lambda: None,
    )
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


def test_mineru_cloud_provider_uses_dualweave_when_enabled(monkeypatch, tmp_path):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    fake_dualweave = _FakeDualweaveClient(
        result={
            "upload_id": "upl-123",
            "status": "completed",
            "stage": "workflow_completed",
            "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
        }
    )
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.build_dualweave_client",
        lambda: fake_dualweave,
    )
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.httpx.Client",
        _FakeZipDownloadClient,
    )

    file_path = tmp_path / "demo.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")

    provider = MineruCloudProvider()
    text, details = provider.extract_text(str(file_path), "demo.pdf", "pdf")

    assert "dualweave result" in text
    assert details["provider_used"] == "dualweave_mineru"
    assert details["dualweave_upload_id"] == "upl-123"
    assert details["dualweave_status"] == "completed"
    assert details["dualweave_stage"] == "workflow_completed"
    assert details["dualweave_result_url"] == "https://example.invalid/result.zip"
    assert fake_dualweave.wait_calls == 1
    assert fake_dualweave.calls[0]["mime_type"] == "application/pdf"
    assert fake_dualweave.calls[0]["source_provider"] == "mineru_cloud"


def test_mineru_cloud_provider_waits_for_latest_dualweave_result(monkeypatch, tmp_path):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    fake_dualweave = _FakeDualweaveClient(
        result={
            "upload_id": "upl-123",
            "status": "pending_remote",
            "stage": "remote_sending",
        }
    )
    fake_dualweave.wait_for_result_url_sync = lambda result: {
        **result,
        "status": "completed",
        "stage": "workflow_completed",
        "result_source": "service_replay",
        "replay_status": "succeeded",
        "processing_artifact": {"result_url": "https://example.invalid/result.zip"},
    }
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.build_dualweave_client",
        lambda: fake_dualweave,
    )
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.httpx.Client",
        _FakeZipDownloadClient,
    )

    file_path = tmp_path / "demo.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")

    provider = MineruCloudProvider()
    text, details = provider.extract_text(str(file_path), "demo.pdf", "pdf")

    assert "dualweave result" in text
    assert details["dualweave_result_source"] == "service_replay"
    assert details["dualweave_replay_status"] == "succeeded"


def test_mineru_cloud_provider_returns_empty_text_when_dualweave_lacks_result_url(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.build_dualweave_client",
        lambda: _FakeDualweaveClient(result={"upload_id": "upl-123"}),
    )

    file_path = tmp_path / "demo.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")

    provider = MineruCloudProvider()
    text, details = provider.extract_text(str(file_path), "demo.pdf", "pdf")

    assert text == ""
    assert details["provider_used"] == "dualweave_mineru"
    assert details["provider_error_type"] == "upstream_exception"
    assert "dualweave_missing_result_url" in details["provider_error"]


def test_mineru_cloud_provider_returns_empty_text_when_dualweave_zip_is_invalid(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("DUALWEAVE_ENABLED", "true")
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.build_dualweave_client",
        lambda: _FakeDualweaveClient(
            result={
                "upload_id": "upl-123",
                "status": "completed",
                "stage": "workflow_completed",
                "processing_artifact": {
                    "result_url": "https://example.invalid/bad.zip"
                },
            }
        ),
    )
    monkeypatch.setattr(
        "services.parsers.mineru_cloud_provider.httpx.Client",
        _FakeZipDownloadClient,
    )

    file_path = tmp_path / "demo.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")

    provider = MineruCloudProvider()
    text, details = provider.extract_text(str(file_path), "demo.pdf", "pdf")

    assert text == ""
    assert details["provider_used"] == "dualweave_mineru"
    assert details["provider_error_type"] == "upstream_exception"
