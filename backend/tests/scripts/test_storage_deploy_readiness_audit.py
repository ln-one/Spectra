from scripts.storage_deploy_readiness_audit import evaluate_storage_readiness


def test_storage_readiness_warns_for_repo_local_defaults():
    messages, failures = evaluate_storage_readiness({})

    assert failures == 0
    assert messages[0] == "Storage deployment readiness audit"
    assert any("UPLOAD_DIR not configured" in message for message in messages)
    assert any(
        "file uploads and artifacts still rely on repo-local storage defaults"
        in message
        for message in messages
    )
    assert any(
        "generation outputs still rely on local `generated` directory" in message
        for message in messages
    )


def test_storage_readiness_accepts_explicit_shared_paths():
    messages, failures = evaluate_storage_readiness(
        {
            "UPLOAD_DIR": "/var/lib/spectra/uploads",
            "ARTIFACT_STORAGE_DIR": "/var/lib/spectra/artifacts",
            "GENERATED_DIR": "/var/lib/spectra/generated",
            "CHROMA_PERSIST_DIR": "/var/lib/chroma",
        }
    )

    assert failures == 0
    assert any("PASS UPLOAD_DIR points to" in message for message in messages)
    assert any("PASS ARTIFACT_STORAGE_DIR points to" in message for message in messages)
    assert any("PASS GENERATED_DIR points to" in message for message in messages)
    assert any("PASS CHROMA_PERSIST_DIR points to" in message for message in messages)
