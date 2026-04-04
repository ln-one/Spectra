from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from schemas.generation import TaskStatus
from services.generation.marp_document import (
    normalize_marp_markdown,
    split_marp_document,
)
from services.task_executor.generation import (
    _build_initial_stream_preview_payload,
    _validate_required_output_urls,
)
from services.task_executor.generation_runtime import (
    GenerationExecutionContext,
    _build_project_space_download_url,
    build_generation_inputs,
    persist_generation_artifacts,
    persist_preview_payload,
    render_generation_outputs,
)
from services.task_executor.preview_runtime import cache_preview_content


def test_build_project_space_download_url():
    assert (
        _build_project_space_download_url(project_id="p-1", artifact_id="a-1")
        == "/api/v1/projects/p-1/artifacts/a-1/download"
    )


def test_build_initial_stream_preview_payload_uses_outline_markdown():
    payload = _build_initial_stream_preview_payload(
        project_name="Networking",
        outline_document={
            "nodes": [
                {
                    "order": 1,
                    "title": "Slide 1",
                    "key_points": ["A", "B", "C"],
                }
            ]
        },
    )

    assert payload is not None
    assert payload["title"] == "Networking"
    assert "# Slide 1" in payload["markdown_content"]
    assert payload["rendered_preview"] == {
        "format": "png",
        "pages": [],
        "page_count": 0,
    }


@pytest.mark.asyncio
async def test_persist_generation_artifacts_returns_download_urls():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        userId="u-1",
                        baseVersionId="v-1",
                        projectId="p-1",
                    )
                )
            )
        ),
        create_artifact=AsyncMock(
            side_effect=[
                SimpleNamespace(id="artifact-ppt"),
                SimpleNamespace(id="artifact-doc"),
            ]
        ),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="p-1",
        session_id="s-1",
        retrieval_mode="strict_sources",
        policy_version="prompt-policy-v2026-03-28",
        baseline_id="prompt-baseline-v1",
    )

    output_urls = await persist_generation_artifacts(
        db_service=db_service,
        context=context,
        artifact_paths={
            "pptx": "/tmp/a.pptx",
            "docx": "/tmp/a.docx",
        },
    )

    assert output_urls == {
        "pptx": "/api/v1/projects/p-1/artifacts/artifact-ppt/download",
        "docx": "/api/v1/projects/p-1/artifacts/artifact-doc/download",
    }
    db_service.db.generationsession.find_unique.assert_awaited_once_with(
        where={"id": "s-1"},
        select={
            "userId": True,
            "baseVersionId": True,
            "projectId": True,
        },
    )
    create_calls = db_service.create_artifact.await_args_list
    assert create_calls[0].kwargs["metadata"]["retrieval_mode"] == "strict_sources"
    assert (
        create_calls[0].kwargs["metadata"]["policy_version"]
        == "prompt-policy-v2026-03-28"
    )
    assert create_calls[0].kwargs["metadata"]["baseline_id"] == "prompt-baseline-v1"


@pytest.mark.asyncio
async def test_persist_generation_artifacts_partial_failure_keeps_success_outputs():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        userId="u-1",
                        baseVersionId="v-1",
                        projectId="p-1",
                    )
                )
            )
        ),
        create_artifact=AsyncMock(
            side_effect=[
                RuntimeError("pptx persist failed"),
                SimpleNamespace(id="artifact-doc"),
            ]
        ),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="p-1",
        session_id="s-1",
        retrieval_mode="strict_sources",
        policy_version="prompt-policy-v2026-03-28",
        baseline_id="prompt-baseline-v1",
    )

    output_urls = await persist_generation_artifacts(
        db_service=db_service,
        context=context,
        artifact_paths={
            "pptx": "/tmp/a.pptx",
            "docx": "/tmp/a.docx",
        },
    )

    assert output_urls == {
        "docx": "/api/v1/projects/p-1/artifacts/artifact-doc/download",
    }


@pytest.mark.asyncio
async def test_persist_generation_artifacts_word_updates_run_trace_contract():
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationsession=SimpleNamespace(
                find_unique=AsyncMock(
                    return_value=SimpleNamespace(
                        userId="u-1",
                        baseVersionId="v-1",
                        projectId="p-1",
                    )
                )
            )
        ),
        create_artifact=AsyncMock(return_value=SimpleNamespace(id="artifact-doc")),
    )
    context = SimpleNamespace(
        task_id="task-1",
        project_id="p-1",
        session_id="s-1",
        run_id="run-1",
        run_no=3,
        run_title="第3次Word生成",
        tool_type="word_generate",
    )

    with patch(
        "services.task_executor.runtime_helpers.update_session_run",
        new=AsyncMock(),
    ) as mock_update_run:
        output_urls = await persist_generation_artifacts(
            db_service=db_service,
            context=context,
            artifact_paths={"docx": "/tmp/a.docx"},
        )

    assert output_urls == {
        "docx": "/api/v1/projects/p-1/artifacts/artifact-doc/download",
    }
    create_kwargs = db_service.create_artifact.await_args.kwargs
    metadata = create_kwargs["metadata"]
    assert create_kwargs["artifact_type"] == "docx"
    assert metadata["output_type"] == "word"
    assert metadata["run_id"] == "run-1"
    assert metadata["run_no"] == 3
    assert metadata["run_title"] == "第3次Word生成"
    assert metadata["tool_type"] == "word_generate"
    mock_update_run.assert_awaited_once_with(
        db=db_service.db,
        run_id="run-1",
        artifact_id="artifact-doc",
    )


@pytest.mark.asyncio
async def test_render_generation_outputs_parallel_for_both():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-1",
        project_id="p-1",
        task_type="both",
        template_config=None,
        session_id="s-1",
    )

    with (
        patch(
            "services.generation.generation_service.generate_pptx",
            new=AsyncMock(return_value="/tmp/task-1.pptx"),
        ) as mock_pptx,
        patch(
            "services.generation.generation_service.generate_docx",
            new=AsyncMock(return_value="/tmp/task-1.docx"),
        ) as mock_docx,
    ):
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_pptx.await_count == 1
    assert mock_docx.await_count == 1
    assert output_urls == {}
    assert artifact_paths == {
        "pptx": "/tmp/task-1.pptx",
        "docx": "/tmp/task-1.docx",
    }
    assert "render_ppt_ms" in render_timings
    assert "render_word_ms" in render_timings
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-1", TaskStatus.PROCESSING, 90
    )


@pytest.mark.asyncio
async def test_render_generation_outputs_pptx_only_keeps_progress_contract():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-2",
        project_id="p-1",
        task_type="pptx",
        template_config=None,
        session_id="s-2",
    )

    with patch(
        "services.generation.generation_service.generate_pptx",
        new=AsyncMock(return_value="/tmp/task-2.pptx"),
    ) as mock_pptx:
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_pptx.await_count == 1
    assert output_urls == {}
    assert artifact_paths == {"pptx": "/tmp/task-2.pptx"}
    assert "render_ppt_ms" in render_timings
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-2", TaskStatus.PROCESSING, 60
    )


@pytest.mark.asyncio
async def test_render_generation_outputs_non_session_still_emits_direct_urls():
    db_service = SimpleNamespace(update_generation_task_status=AsyncMock())
    context = GenerationExecutionContext(
        task_id="task-3",
        project_id="p-1",
        task_type="docx",
        template_config=None,
        session_id=None,
    )

    with patch(
        "services.generation.generation_service.generate_docx",
        new=AsyncMock(return_value="/tmp/task-3.docx"),
    ) as mock_docx:
        output_urls, artifact_paths, render_timings = await render_generation_outputs(
            db_service=db_service,
            context=context,
            courseware_content=SimpleNamespace(),
        )

    assert mock_docx.await_count == 1
    assert output_urls == {"docx": "/tmp/task-3.docx"}
    assert artifact_paths == {"docx": "/tmp/task-3.docx"}
    assert "render_word_ms" in render_timings
    db_service.update_generation_task_status.assert_awaited_once_with(
        "task-3", TaskStatus.PROCESSING, 90
    )


@pytest.mark.asyncio
async def test_persist_preview_payload_merges_existing_input_data():
    find_unique = AsyncMock(
        return_value=SimpleNamespace(
            inputData='{"template_config":{"style":"gaia"},"foo":"bar"}'
        )
    )
    update = AsyncMock()
    db_service = SimpleNamespace(
        db=SimpleNamespace(
            generationtask=SimpleNamespace(
                find_unique=find_unique,
                update=update,
            )
        )
    )

    await persist_preview_payload(
        db_service,
        task_id="task-100",
        preview_payload={
            "title": "T",
            "markdown_content": "# Slide",
            "lesson_plan_markdown": "plan",
        },
    )

    find_unique.assert_awaited_once_with(
        where={"id": "task-100"},
        select={"inputData": True},
    )
    update.assert_awaited_once()
    payload = update.await_args.kwargs["data"]["inputData"]
    assert '"template_config"' in payload
    assert '"preview_content"' in payload


@pytest.mark.asyncio
async def test_cache_preview_content_includes_rendered_preview():
    courseware = SimpleNamespace(
        title="T",
        markdown_content="# Slide",
        lesson_plan_markdown="plan",
    )
    with (
        patch(
            "services.preview_helpers.save_preview_content",
            new=AsyncMock(),
        ),
        patch(
            "services.task_executor.preview_runtime.build_rendered_preview_payload",
            new=AsyncMock(
                return_value={
                    "format": "png",
                    "page_count": 1,
                    "pages": [
                        {
                            "index": 0,
                            "slide_id": "task-200-slide-0",
                            "image_url": "data:image/png;base64,abc",
                        }
                    ],
                }
            ),
        ),
    ):
        payload = await cache_preview_content(
            "task-200",
            courseware,
            template_config={"style": "default"},
        )

    assert payload["rendered_preview"]["page_count"] == 1


@pytest.mark.asyncio
async def test_cache_preview_content_streams_slide_events(tmp_path):
    courseware = SimpleNamespace(
        title="T",
        markdown_content="# Slide 1\n\n---\n\n# Slide 2",
        lesson_plan_markdown="plan",
    )
    png_stub = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
    image_1 = tmp_path / "task-201_temp.001.png"
    image_2 = tmp_path / "task-201_temp.002.png"
    image_1.write_bytes(png_stub)
    image_2.write_bytes(png_stub)

    streamed_payloads: list[dict] = []
    persisted_snapshots: list[dict] = []

    async def _on_slide(payload: dict):
        streamed_payloads.append(payload)

    async def _on_preview_updated(payload: dict):
        persisted_snapshots.append(payload)

    async def _fake_generate_slide_images(
        _content, _task_id, template_config=None, on_image_generated=None
    ):
        if on_image_generated:
            await on_image_generated(0, str(image_1))
            await on_image_generated(1, str(image_2))
        return [str(image_1), str(image_2)]

    save_mock = AsyncMock()
    with (
        patch(
            "services.task_executor.preview_runtime.save_preview_content",
            new=save_mock,
        ),
        patch(
            "services.task_executor.preview_runtime.generation_service.generate_slide_images",
            new=_fake_generate_slide_images,
        ),
    ):
        payload = await cache_preview_content(
            "task-201",
            courseware,
            template_config={"style": "default"},
            on_slide_rendered=_on_slide,
            on_preview_payload_updated=_on_preview_updated,
        )

    assert payload["rendered_preview"]["page_count"] == 2
    assert len(payload["rendered_preview"]["pages"]) == 2
    assert len(streamed_payloads) == 2
    assert streamed_payloads[0]["slide_index"] == 0
    assert streamed_payloads[1]["slide_index"] == 1
    assert save_mock.await_count >= 3
    assert len(persisted_snapshots) >= 3


@pytest.mark.asyncio
async def test_cache_preview_content_uses_render_markdown_slide_structure(tmp_path):
    courseware = SimpleNamespace(
        title="T",
        markdown_content="# Summary only",
        render_markdown=(
            "---\nmarp: true\n---\n\n"
            "<style>section { color: #222; }</style>\n\n"
            "<!-- _class: cover -->\n\n# Slide 1\n\n---\n\n# Slide 2\n\n---"
        ),
        lesson_plan_markdown="plan",
    )
    png_stub = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
    image_1 = tmp_path / "task-202_temp.001.png"
    image_2 = tmp_path / "task-202_temp.002.png"
    image_1.write_bytes(png_stub)
    image_2.write_bytes(png_stub)

    streamed_payloads: list[dict] = []

    async def _on_slide(payload: dict):
        streamed_payloads.append(payload)

    async def _fake_generate_slide_images(
        _content, _task_id, template_config=None, on_image_generated=None
    ):
        if on_image_generated:
            await on_image_generated(0, str(image_1))
            await on_image_generated(1, str(image_2))
        return [str(image_1), str(image_2)]

    with (
        patch(
            "services.task_executor.preview_runtime.save_preview_content",
            new=AsyncMock(),
        ),
        patch(
            "services.task_executor.preview_runtime.generation_service.generate_slide_images",
            new=_fake_generate_slide_images,
        ),
    ):
        payload = await cache_preview_content(
            "task-202",
            courseware,
            template_config={"style": "default"},
            on_slide_rendered=_on_slide,
            on_preview_payload_updated=AsyncMock(),
        )

    assert payload["rendered_preview"]["page_count"] == 2
    assert [item["total_slides"] for item in streamed_payloads] == [2, 2]
    assert [item["slide_id"] for item in streamed_payloads] == [
        "task-202-slide-0",
        "task-202-slide-1",
    ]


@pytest.mark.asyncio
async def test_generate_slide_images_collects_temp_stem_outputs(tmp_path):
    from services.generation.marp_generator import generate_slide_images

    async def _fake_exec(*_args, **_kwargs):
        (tmp_path / "task-300_temp.001.png").write_bytes(
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
        )
        (tmp_path / "task-300_temp.002.png").write_bytes(
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
        )

        class _Proc:
            returncode = 0

            async def communicate(self):
                return b"", b""

        return _Proc()

    with (
        patch(
            "services.generation.marp_generator.check_marp_installed",
            new=lambda: None,
        ),
        patch(
            "services.generation.marp_generator.ensure_directory_exists",
            new=lambda _path: None,
        ),
        patch(
            "services.generation.marp_generator.get_temp_file_path",
            new=lambda _output_dir, _task_id, _ext: Path(tmp_path / "task-300_temp.md"),
        ),
        patch(
            "services.generation.marp_generator.validate_file_exists",
            new=lambda path, min_size=1: Path(path).exists()
            and Path(path).stat().st_size >= min_size,
        ),
        patch(
            "services.generation.marp_generator.asyncio.create_subprocess_exec",
            new=_fake_exec,
        ),
    ):
        images = await generate_slide_images("task-300", tmp_path, "# Demo")

    assert images == [
        str(tmp_path / "task-300_temp.001.png"),
        str(tmp_path / "task-300_temp.002.png"),
    ]


@pytest.mark.asyncio
async def test_generate_slide_images_stream_mode_emits_page_by_page(tmp_path):
    from services.generation.marp_generator import generate_slide_images

    created_commands: list[tuple] = []
    streamed_markdowns: list[str] = []

    async def _fake_exec(*args, **_kwargs):
        created_commands.append(args)

        class _Proc:
            returncode = 0

            async def communicate(self):
                streamed_markdown = Path(args[1]).read_text(encoding="utf-8")
                streamed_markdowns.append(streamed_markdown)
                output_path = Path(args[5])
                output_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 24)
                return b"", b""

        return _Proc()

    streamed_pages: list[tuple[int, str]] = []

    async def _on_image_generated(index: int, path: str):
        streamed_pages.append((index, path))

    async def _transform_slide_markdown(index: int, slide_document: str) -> str:
        return f"{slide_document}\n\n<!-- transformed:{index} -->"

    with (
        patch(
            "services.generation.marp_generator.check_marp_installed",
            new=lambda: None,
        ),
        patch(
            "services.generation.marp_generator.ensure_directory_exists",
            new=lambda _path: None,
        ),
        patch(
            "services.generation.marp_generator.get_temp_file_path",
            new=lambda _output_dir, task, _ext: Path(tmp_path / f"{task}_temp.md"),
        ),
        patch(
            "services.generation.marp_generator.validate_file_exists",
            new=lambda path, min_size=1: Path(path).exists()
            and Path(path).stat().st_size >= min_size,
        ),
        patch(
            "services.generation.marp_generator.asyncio.create_subprocess_exec",
            new=_fake_exec,
        ),
    ):
        images = await generate_slide_images(
            "task-301",
            tmp_path,
            "---\nmarp: true\n---\n\n# Slide 1\n\n---\n\n# Slide 2",
            on_image_generated=_on_image_generated,
            transform_slide_markdown=_transform_slide_markdown,
        )

    assert len(created_commands) == 2
    assert [Path(cmd[5]).name for cmd in created_commands] == [
        "task-301_temp.001.png",
        "task-301_temp.002.png",
    ]
    assert "<!-- transformed:0 -->" in streamed_markdowns[0]
    assert "<!-- transformed:1 -->" in streamed_markdowns[1]
    assert [item[0] for item in streamed_pages] == [0, 1]
    assert images == [
        str(tmp_path / "task-301_temp.001.png"),
        str(tmp_path / "task-301_temp.002.png"),
    ]


def test_split_marp_document_strips_global_style_and_trailing_separator():
    frontmatter, style_blocks, slides = split_marp_document(
        "---\nmarp: true\n---\n\n"
        "<style>section { color: #222; }</style>\n\n"
        "# Slide 1\n\n---\n\n# Slide 2\n\n---"
    )

    assert frontmatter == "---\nmarp: true\n---"
    assert style_blocks == "<style>section { color: #222; }</style>"
    assert slides == ["# Slide 1", "# Slide 2"]


def test_normalize_marp_markdown_merges_style_into_first_slide():
    normalized = normalize_marp_markdown(
        "---\nmarp: true\n---\n\n"
        "<style>section { color: #222; }</style>\n\n"
        "# Slide 1\n\n---\n\n# Slide 2\n\n---"
    )
    frontmatter, style_blocks, slides = split_marp_document(normalized)

    assert frontmatter == "---\nmarp: true\n---"
    assert style_blocks == "<style>section { color: #222; }</style>"
    assert slides == ["# Slide 1", "# Slide 2"]
    assert normalized.endswith("# Slide 2\n")
    assert "<style>section { color: #222; }</style>\n\n# Slide 1" in normalized


def test_validate_required_output_urls_raises_for_missing_both_output():
    with pytest.raises(ValueError, match="pptx, docx"):
        _validate_required_output_urls(task_type="both", output_urls={})


def test_validate_required_output_urls_allows_ppt_only_success():
    _validate_required_output_urls(
        task_type="pptx",
        output_urls={"pptx": "/api/v1/projects/p-1/artifacts/a-1/download"},
    )


@pytest.mark.asyncio
async def test_build_generation_inputs_injects_images_for_ppt_flow():
    db_service = SimpleNamespace()
    courseware = SimpleNamespace(
        title="网络课件",
        markdown_content="# 封面\n\n- 引入",
        lesson_plan_markdown="# 教案",
    )
    context = GenerationExecutionContext(
        task_id="task-img-1",
        project_id="p-1",
        task_type="pptx",
        template_config={"rag_source_ids": ["u-image-1"]},
        session_id="s-1",
    )

    with (
        patch(
            "services.task_executor.generation_runtime.build_user_requirements",
            new=AsyncMock(return_value="网络课件需求"),
        ),
        patch(
            "services.task_executor.generation_runtime.load_session_outline",
            new=AsyncMock(return_value=(None, None)),
        ),
        patch(
            "services.ai.ai_service.generate_courseware_content",
            new=AsyncMock(return_value=courseware),
        ),
        patch(
            "services.task_executor.generation_runtime.inject_rag_images_into_courseware_content",
            new=AsyncMock(),
        ) as inject_mock,
    ):
        result = await build_generation_inputs(db_service, context)

    assert result is courseware
    inject_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_build_generation_inputs_skips_image_injection_for_docx_only():
    db_service = SimpleNamespace()
    courseware = SimpleNamespace(
        title="教案",
        markdown_content="# 封面\n\n- 引入",
        lesson_plan_markdown="# 教案",
    )
    context = GenerationExecutionContext(
        task_id="task-img-2",
        project_id="p-1",
        task_type="docx",
        template_config={"rag_source_ids": ["u-image-1"]},
        session_id="s-1",
    )

    with (
        patch(
            "services.task_executor.generation_runtime.build_user_requirements",
            new=AsyncMock(return_value="教案需求"),
        ),
        patch(
            "services.task_executor.generation_runtime.load_session_outline",
            new=AsyncMock(return_value=(None, None)),
        ),
        patch(
            "services.ai.ai_service.generate_courseware_content",
            new=AsyncMock(return_value=courseware),
        ),
        patch(
            "services.task_executor.generation_runtime.inject_rag_images_into_courseware_content",
            new=AsyncMock(),
        ) as inject_mock,
    ):
        result = await build_generation_inputs(db_service, context)

    assert result is courseware
    inject_mock.assert_not_awaited()
