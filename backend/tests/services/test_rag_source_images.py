import asyncio
import io
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.rag_api_service import source_images
from utils.exceptions import NotFoundException, ValidationException


def _build_zip(entries: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return output.getvalue()


def test_normalize_image_relative_path_accepts_images_prefix():
    assert (
        source_images.normalize_image_relative_path("./images/demo.jpg")
        == "images/demo.jpg"
    )


@pytest.mark.parametrize(
    "value",
    ["", "/images/a.jpg", "../images/a.jpg", "notes/a.jpg", "images/../a.jpg"],
)
def test_normalize_image_relative_path_rejects_invalid_inputs(value):
    with pytest.raises(ValidationException):
        source_images.normalize_image_relative_path(value)


def test_extract_image_entry_raises_not_found_for_missing_entry():
    zip_bytes = _build_zip({"images/a.jpg": b"123"})
    with pytest.raises(NotFoundException):
        source_images._extract_image_entry(zip_bytes, "images/missing.jpg")


@pytest.mark.asyncio
async def test_load_source_image_payload_uses_cache_and_avoids_duplicate_download(
    monkeypatch, tmp_path
):
    upload = SimpleNamespace(
        id="upload-1", parseResult={"dualweave_result_url": "https://x/y.zip"}
    )
    parsed = SimpleNamespace(upload=upload)
    zip_bytes = _build_zip({"images/a.jpg": b"binary-jpg"})
    download_mock = AsyncMock(return_value=zip_bytes)

    monkeypatch.setattr(source_images, "_download_zip_bytes", download_mock)
    monkeypatch.setattr(source_images, "_get_cache_root", lambda: tmp_path)

    async def _call_once():
        return await source_images.load_source_image_payload(
            chunk_id="chunk-1",
            image_path="images/a.jpg",
            parsed=parsed,
        )

    first, second = await asyncio.gather(_call_once(), _call_once())
    assert first.content == b"binary-jpg"
    assert second.content == b"binary-jpg"
    assert first.media_type == "image/jpeg"
    assert download_mock.await_count == 1
