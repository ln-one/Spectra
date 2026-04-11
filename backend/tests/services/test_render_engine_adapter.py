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
    assert payload["document"]["pages"][0]["kind"] == "chapter_cover"
    assert payload["document"]["pages"][0]["layout"] == "chapter_cover"
    assert payload["document"]["pages"][1]["kind"] == "chapter_agenda"
    assert payload["document"]["pages"][1]["layout"] == "chapter_agenda"
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


def test_normalize_render_engine_result_preserves_job_markdown_metadata():
    result = normalize_render_engine_result(
        {
            "markdown": "# Resolved",
            "markdown_path": "/tmp/resolved.md",
            "artifacts": {"pptx_path": "/tmp/demo.pptx"},
            "warnings": [],
            "events": [],
            "metrics": {"page_count": 1},
        }
    )

    assert result["markdown"] == "# Resolved"
    assert result["markdown_path"] == "/tmp/resolved.md"
    assert result["artifact_paths"] == {"pptx": "/tmp/demo.pptx"}


def test_build_render_engine_page_input_maps_page_payload():
    payload = build_render_engine_page_input(
        render_job_id="job-1",
        page_id="job-1-slide-0",
        page_index=0,
        page_payload={
            "title": "封面",
            "kind": "chapter_cover",
            "layout": "chapter_cover",
            "density": "density-medium",
            "structure": {
                "chapter_cover": {
                    "course_title": "封面",
                    "subtitle": "副标题",
                }
            },
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
    assert payload["page"]["kind"] == "chapter_cover"
    assert payload["page"]["layout"] == "chapter_cover"
    assert payload["page"]["structure"]["chapter_cover"]["subtitle"] == "副标题"
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


def test_build_render_engine_input_infers_teaching_summary_and_diagram_pages():
    payload = build_render_engine_input(
        {
            "title": "测试课件",
            "render_markdown": (
                "---\nmarp: true\n---\n\n"
                "<!-- _class: content density-medium -->\n\n"
                "# 学习目标\n\n"
                "## 本章重点\n\n"
                "- 理解协议分层\n- 掌握封装过程\n\n---\n\n"
                "<!-- _class: content density-medium -->\n\n"
                "# 协议流程\n\n"
                "```mermaid\ngraph TD\nA-->B\n```\n\n"
                "- 第一步\n- 第二步\n\n---\n\n"
                "<!-- _class: content density-medium -->\n\n"
                "# 本章总结\n\n"
                "- 要点一\n- 要点二\n- 要点三\n- 要点四\n- 要点五\n"
            ),
            "lesson_plan_markdown": "# 教案",
        },
        {"style": "teach", "template_id": "document-teaching"},
        ["preview"],
        render_job_id="job-teach",
    )

    pages = payload["document"]["pages"]
    assert pages[0]["layout"] == "learning_objectives"
    assert pages[0]["structure"]["learning_objectives"]["objectives"] == [
        "理解协议分层",
        "掌握封装过程",
    ]
    assert pages[1]["layout"] == "process_walkthrough"
    assert pages[1]["structure"]["process_walkthrough"]["steps"] == [
        "第一步",
        "第二步",
    ]
    assert pages[2]["layout"] == "summary_page"
    assert pages[2]["structure"]["summary_page"]["key_points"] == [
        "要点一",
        "要点二",
        "要点三",
        "要点四",
        "要点五",
    ]


def test_build_render_engine_input_keeps_export_on_structured_pipeline_when_render_markdown_exists():
    payload = build_render_engine_input(
        {
            "title": "测试课件",
            "markdown_content": "# 第一页\n\n正文",
            "render_markdown": (
                "---\nmarp: true\n---\n\n"
                "<!-- _class: content density-medium -->\n\n"
                "# 第一页\n\n正文\n\n---\n\n# 第二页\n\n更多内容"
            ),
        },
        {"style": "teach", "template_id": "document-teaching"},
        ["pptx"],
        render_job_id="job-structured-export",
    )

    assert payload["job_marp_markdown"] is None
    assert len(payload["document"]["pages"]) == 2


def test_normalize_render_engine_page_result_extracts_html_preview():
    result = normalize_render_engine_page_result(
        {
            "page_id": "slide-1",
            "page_index": 0,
            "markdown": "---\nmarp: true\n---\n\n# Demo",
            "markdown_path": "/tmp/slide-1.md",
            "html_preview": "<section>demo</section>",
            "preview_image_path": "/tmp/slide-1.png",
            "warnings": [{"code": "w1", "message": "warn"}],
            "events": [{"type": "preview_ready"}],
            "metrics": {"page_index": 0, "overflow_guard_applied": True},
        }
    )

    assert result["page_id"] == "slide-1"
    assert result["markdown"] == "---\nmarp: true\n---\n\n# Demo"
    assert result["markdown_path"] == "/tmp/slide-1.md"
    assert result["html_preview"] == "<section>demo</section>"
    assert result["preview_image_path"] == "/tmp/slide-1.png"
    assert result["warnings"][0]["code"] == "w1"
    assert result["events"][0]["type"] == "preview_ready"


def test_normalize_render_engine_page_result_preserves_split_previews():
    result = normalize_render_engine_page_result(
        {
            "page_id": "slide-2",
            "page_index": 1,
            "html_preview": "<section>first</section>",
            "html_previews": [
                "<section>first</section>",
                "<section>second</section>",
            ],
            "preview_image_path": "/tmp/slide-2-a.png",
            "preview_image_paths": [
                "/tmp/slide-2-a.png",
                "/tmp/slide-2-b.png",
            ],
            "metrics": {"page_index": 1},
        }
    )

    assert result["html_previews"] == [
        "<section>first</section>",
        "<section>second</section>",
    ]
    assert result["preview_image_paths"] == [
        "/tmp/slide-2-a.png",
        "/tmp/slide-2-b.png",
    ]


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
