from pathlib import Path

from services.runtime_paths import (
    DEFAULT_ARTIFACT_STORAGE_DIR,
    DEFAULT_CHROMA_PERSIST_DIR,
    DEFAULT_GENERATED_DIR,
    DEFAULT_UPLOAD_DIR,
    get_artifact_storage_dir,
    get_chroma_persist_dir,
    get_generated_dir,
    get_upload_dir,
)


def test_runtime_paths_default_to_local_dirs(monkeypatch):
    monkeypatch.delenv("UPLOAD_DIR", raising=False)
    monkeypatch.delenv("ARTIFACT_STORAGE_DIR", raising=False)
    monkeypatch.delenv("GENERATED_DIR", raising=False)
    monkeypatch.delenv("CHROMA_PERSIST_DIR", raising=False)

    assert get_upload_dir() == Path(DEFAULT_UPLOAD_DIR)
    assert get_artifact_storage_dir() == Path(DEFAULT_ARTIFACT_STORAGE_DIR)
    assert get_generated_dir() == Path(DEFAULT_GENERATED_DIR)
    assert get_chroma_persist_dir() == Path(DEFAULT_CHROMA_PERSIST_DIR)


def test_runtime_paths_prefer_explicit_env(monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", "/var/lib/spectra/uploads")
    monkeypatch.setenv("ARTIFACT_STORAGE_DIR", "/var/lib/spectra/artifacts")
    monkeypatch.setenv("GENERATED_DIR", "/var/lib/spectra/generated")
    monkeypatch.setenv("CHROMA_PERSIST_DIR", "/var/lib/spectra/chroma")

    assert get_upload_dir() == Path("/var/lib/spectra/uploads")
    assert get_artifact_storage_dir() == Path("/var/lib/spectra/artifacts")
    assert get_generated_dir() == Path("/var/lib/spectra/generated")
    assert get_chroma_persist_dir() == Path("/var/lib/spectra/chroma")
