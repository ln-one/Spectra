import json

from services.render_engine_adapter import (
    build_render_engine_input,
    build_render_engine_page_input,
    invoke_render_engine,
    invoke_render_engine_page,
    normalize_render_engine_page_result,
    normalize_render_engine_result,
)


def test_build_render_engine_input_maps_courseware_content_to_structured_payload():
    courseware_content = {
        "title": "测试课件",
        "markdown_content": "# 封面\n\n---\n\n# 目录\n\n- 第一章\n- 第二章\n\n---\n\n## 知识点\n\n- A\n- B",
        "lesson_plan_markdown": "# 教案\n\n- 目标",
    }

    payload = build_render_engine_input(
        courseware_content,
        {"style": "gaia"},
        ["pptx", "preview"],
        render_job_id="job-1",
    )

    assert payload["render_job_id"] == "job-1"
    assert payload["theme"] == "gaia"
    assert payload["output_targets"] == ["pptx", "preview"]
    assert payload["document"]["title"] == "测试课件"
    assert len(payload["document"]["pages"]) == 3
    assert payload["document"]["pages"][0]["kind"] == "cover"
    assert payload["document"]["pages"][1]["kind"] == "toc"
    assert payload["render"]["theme"]["theme_id"] == "gaia"
    assert payload["render"]["theme"]["template_id"] == "document-teaching"
    assert payload["render"]["template"]["template_id"] == "document-teaching"
    assert payload["job_marp_markdown"] is None


def test_normalize_render_engine_result_extracts_artifacts_preview_and_metrics():
    result = normalize_render_engine_result(
        {
            "artifacts": {
                "pptx_path": "/tmp/demo.pptx",
                "preview_pages": ["/tmp/p-1.png", "/tmp/p-2.png"],
            },
            "warnings": [{"code": "w1", "message": "warn"}],
            "events": [{"type": "compiled"}],
            "metrics": {"page_count": 2, "overflow_guard_applied": True},
        }
    )

    assert result["artifact_paths"] == {"pptx": "/tmp/demo.pptx"}
    assert result["preview_pages"] == ["/tmp/p-1.png", "/tmp/p-2.png"]
    assert result["warnings"][0]["code"] == "w1"
    assert result["events"][0]["type"] == "compiled"
    assert result["metrics"]["page_count"] == 2


def test_build_render_engine_page_input_maps_page_payload():
    payload = build_render_engine_page_input(
        render_job_id="job-1",
        page_id="job-1-slide-0",
        page_index=0,
        page_payload={
            "title": "封面",
            "kind": "cover",
            "density": "density-medium",
            "blocks": [{"type": "heading", "text": "封面", "level": 1}],
        },
        document_title="测试课件",
        template_config={"style": "gaia"},
        style_manifest={
            "design_name": "academic_modern",
            "palette": {},
            "typography": {},
        },
        extra_css=".demo { color: red; }",
        page_class_plan=[
            {
                "slide_index": 1,
                "kind": "cover",
                "density": "density-medium",
                "class_name": "cover density-medium",
            }
        ],
    )

    assert payload["render_job_id"] == "job-1"
    assert payload["page_id"] == "job-1-slide-0"
    assert payload["theme"] == "gaia"
    assert payload["page"]["kind"] == "cover"
    assert payload["page_marp_markdown"] is None
    assert payload["render"]["theme"]["theme_id"] == "gaia"
    assert payload["render"]["theme"]["template_id"] == "document-teaching"
    assert payload["render"]["template"]["template_id"] == "document-teaching"
    assert (
        payload["render"]["theme"]["overrides"]["custom_css"] == ".demo { color: red; }"
    )


def test_build_render_engine_input_allows_explicit_template_override():
    payload = build_render_engine_input(
        {"title": "测试课件", "markdown_content": "# 封面"},
        {"style": "default", "template_id": "document-default"},
        ["preview"],
        render_job_id="job-override",
    )

    assert payload["render"]["theme"]["template_id"] == "document-default"
    assert payload["render"]["template"]["template_id"] == "document-default"


def test_normalize_render_engine_page_result_extracts_html_preview():
    result = normalize_render_engine_page_result(
        {
            "page_id": "slide-1",
            "page_index": 0,
            "html_preview": "<section>demo</section>",
            "preview_image_path": "/tmp/slide-1.png",
            "warnings": [{"code": "w1", "message": "warn"}],
            "events": [{"type": "preview_ready"}],
            "metrics": {"page_index": 0, "overflow_guard_applied": True},
        }
    )

    assert result["page_id"] == "slide-1"
    assert result["html_preview"] == "<section>demo</section>"
    assert result["preview_image_path"] == "/tmp/slide-1.png"
    assert result["warnings"][0]["code"] == "w1"
    assert result["events"][0]["type"] == "preview_ready"


def test_invoke_render_engine_uses_http_api_when_base_url_is_configured(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode("utf-8")

        def getcode(self):
            return 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse(
            {
                "job_id": "job-1",
                "state": "success",
                "state_reason": "render_completed",
                "artifacts": {"pptx_path": "/tmp/out.pptx"},
                "warnings": [],
                "metrics": {
                    "page_count": 1,
                    "render_ms": 10,
                    "overflow_guard_applied": True,
                },
                "events": [],
            }
        )

    monkeypatch.setenv("PAGEVRA_ENABLED", "1")
    monkeypatch.setenv("PAGEVRA_BASE_URL", "http://pagevra:8090")
    monkeypatch.setattr(
        "services.render_engine_adapter.urllib_request.urlopen", fake_urlopen
    )

    payload = {
        "render_job_id": "job-1",
        "output_targets": ["pptx"],
        "output_dir": "/tmp",
        "document": {
            "title": "x",
            "pages": [
                {"kind": "cover", "blocks": [{"type": "paragraph", "text": "x"}]}
            ],
        },
    }

    result = __import__("asyncio").run(invoke_render_engine(payload))

    assert captured["url"] == "http://pagevra:8090/render/jobs"
    assert captured["body"]["render_job_id"] == "job-1"
    assert result["artifacts"]["pptx_path"] == "/tmp/out.pptx"


def test_invoke_render_engine_page_uses_http_page_api(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode("utf-8")

        def getcode(self):
            return 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse(
            {
                "job_id": "job-1",
                "page_id": "slide-1",
                "page_index": 0,
                "state": "success",
                "state_reason": "page_render_completed",
                "html_preview": "<section>demo</section>",
                "warnings": [],
                "metrics": {
                    "page_index": 0,
                    "render_ms": 10,
                    "overflow_guard_applied": True,
                },
                "events": [],
            }
        )

    monkeypatch.setenv("PAGEVRA_ENABLED", "1")
    monkeypatch.setenv("PAGEVRA_BASE_URL", "http://pagevra:8090")
    monkeypatch.setattr(
        "services.render_engine_adapter.urllib_request.urlopen", fake_urlopen
    )

    payload = {
        "render_job_id": "job-1",
        "page_id": "slide-1",
        "page_index": 0,
        "output_dir": "/tmp",
        "page": {
            "page_id": "slide-1",
            "page_index": 0,
            "kind": "cover",
            "blocks": [{"type": "heading", "text": "封面", "level": 1}],
        },
    }

    result = __import__("asyncio").run(invoke_render_engine_page(payload))

    assert captured["url"] == "http://pagevra:8090/render/pages"
    assert captured["body"]["page_id"] == "slide-1"
    assert result["html_preview"] == "<section>demo</section>"
