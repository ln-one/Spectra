from __future__ import annotations

import httpx

from services.parsers.mineru_api_provider import MineruApiProvider


class _DummyResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_direct_parse_endpoint_uses_configured_url(monkeypatch):
    monkeypatch.setenv("MINERU_API_URL", "http://mineru.local:8000/parse")

    provider = MineruApiProvider()

    assert provider.parse_url == "http://mineru.local:8000/parse"


def test_fastapi_root_discovers_upload_endpoint(monkeypatch):
    monkeypatch.setenv("MINERU_API_URL", "http://mineru.local:8000")

    class _DummyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            assert url == "http://mineru.local:8000/openapi.json"
            return _DummyResponse(
                {
                    "paths": {
                        "/health": {"get": {}},
                        "/file_parse": {
                            "post": {
                                "requestBody": {
                                    "content": {
                                        "multipart/form-data": {
                                            "schema": {
                                                "properties": {
                                                    "file": {
                                                        "type": "string",
                                                        "format": "binary",
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                    }
                }
            )

    monkeypatch.setattr(httpx, "Client", _DummyClient)

    provider = MineruApiProvider()

    assert provider.parse_url == "http://mineru.local:8000/file_parse"


def test_fastapi_docs_url_is_normalized_before_discovery(monkeypatch):
    monkeypatch.setenv("MINERU_API_URL", "http://mineru.local:8000/docs")

    class _DummyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            assert url == "http://mineru.local:8000/openapi.json"
            return _DummyResponse(
                {
                    "paths": {
                        "/parse": {
                            "post": {
                                "requestBody": {
                                    "content": {
                                        "multipart/form-data": {
                                            "schema": {
                                                "properties": {
                                                    "file": {
                                                        "type": "string",
                                                        "format": "binary",
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            )

    monkeypatch.setattr(httpx, "Client", _DummyClient)

    provider = MineruApiProvider()

    assert provider.parse_url == "http://mineru.local:8000/parse"


def test_fastapi_root_discovers_array_binary_upload_endpoint(monkeypatch):
    monkeypatch.setenv("MINERU_API_URL", "http://mineru.local:8000")

    class _DummyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            assert url == "http://mineru.local:8000/openapi.json"
            return _DummyResponse(
                {
                    "paths": {
                        "/file_parse": {
                            "post": {
                                "requestBody": {
                                    "content": {
                                        "multipart/form-data": {
                                            "schema": {
                                                "type": "object",
                                                "properties": {
                                                    "files": {
                                                        "type": "array",
                                                        "items": {
                                                            "type": "string",
                                                            "format": "binary",
                                                        },
                                                    }
                                                },
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            )

    monkeypatch.setattr(httpx, "Client", _DummyClient)

    provider = MineruApiProvider()

    assert provider.parse_url == "http://mineru.local:8000/file_parse"


def test_fastapi_root_discovers_ref_binary_upload_endpoint(monkeypatch):
    monkeypatch.setenv("MINERU_API_URL", "http://mineru.local:8000")

    class _DummyClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url):
            assert url == "http://mineru.local:8000/openapi.json"
            return _DummyResponse(
                {
                    "paths": {
                        "/file_parse": {
                            "post": {
                                "requestBody": {
                                    "content": {
                                        "multipart/form-data": {
                                            "schema": {
                                                "$ref": "#/components/schemas/FileParseBody"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "components": {
                        "schemas": {
                            "FileParseBody": {
                                "type": "object",
                                "properties": {
                                    "files": {
                                        "type": "array",
                                        "items": {
                                            "type": "string",
                                            "format": "binary",
                                        },
                                    }
                                },
                            }
                        }
                    },
                }
            )

    monkeypatch.setattr(httpx, "Client", _DummyClient)

    provider = MineruApiProvider()

    assert provider.parse_url == "http://mineru.local:8000/file_parse"
