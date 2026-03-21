from utils.upstream_failures import describe_upstream_failure


def test_describe_upstream_failure_classifies_auth_error():
    info = describe_upstream_failure(Exception("invalid api key"))
    assert info["failure_type"] == "auth_error"
    assert info["retryable"] is False


def test_describe_upstream_failure_classifies_config_error():
    info = describe_upstream_failure(Exception("DASHSCOPE_API_KEY not set"))
    assert info["failure_type"] == "config_error"
    assert info["retryable"] is False


def test_describe_upstream_failure_classifies_timeout():
    info = describe_upstream_failure(Exception("provider timed out"))
    assert info["failure_type"] == "timeout"
    assert info["retryable"] is True


def test_describe_upstream_failure_classifies_provider_unavailable():
    info = describe_upstream_failure(Exception("service unavailable"))
    assert info["failure_type"] == "provider_unavailable"
    assert info["retryable"] is True
