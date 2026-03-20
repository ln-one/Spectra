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

    assert str(get_upload_dir()) == DEFAULT_UPLOAD_DIR
    assert str(get_artifact_storage_dir()) == DEFAULT_ARTIFACT_STORAGE_DIR
    assert str(get_generated_dir()) == DEFAULT_GENERATED_DIR
    assert str(get_chroma_persist_dir()) == DEFAULT_CHROMA_PERSIST_DIR


def test_runtime_paths_prefer_explicit_env(monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", "/var/lib/spectra/uploads")
    monkeypatch.setenv("ARTIFACT_STORAGE_DIR", "/var/lib/spectra/artifacts")
    monkeypatch.setenv("GENERATED_DIR", "/var/lib/spectra/generated")
    monkeypatch.setenv("CHROMA_PERSIST_DIR", "/var/lib/spectra/chroma")

    assert str(get_upload_dir()) == "/var/lib/spectra/uploads"
    assert str(get_artifact_storage_dir()) == "/var/lib/spectra/artifacts"
    assert str(get_generated_dir()) == "/var/lib/spectra/generated"
    assert str(get_chroma_persist_dir()) == "/var/lib/spectra/chroma"
