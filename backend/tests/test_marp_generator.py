from unittest.mock import patch

import pytest

from services.generation.marp_generator import call_marp_cli


class _DummyProcess:
    def __init__(self, returncode: int = 0, stderr: bytes = b""):
        self.returncode = returncode
        self._stderr = stderr

    async def communicate(self):
        return b"ok", self._stderr


@pytest.mark.asyncio
async def test_call_marp_cli_uses_editable_pptx_and_browser_path(tmp_path):
    md_file = tmp_path / "input.md"
    out_file = tmp_path / "output.pptx"
    md_file.write_text("# test", encoding="utf-8")

    captured_cmd = {}

    async def _fake_create_subprocess_exec(*cmd, **kwargs):
        captured_cmd["cmd"] = list(cmd)
        return _DummyProcess()

    with (
        patch(
            "services.generation.marp_generator.check_marp_installed",
            return_value=True,
        ),
        patch(
            "services.generation.marp_generator.asyncio.create_subprocess_exec",
            side_effect=_fake_create_subprocess_exec,
        ),
    ):
        await call_marp_cli(md_file, out_file)

    cmd = captured_cmd["cmd"]
    assert "--pptx" in cmd
    assert "--pptx-editable" in cmd
    assert "--browser-path" in cmd
    browser_path_idx = cmd.index("--browser-path") + 1
    assert cmd[browser_path_idx]
    assert str(md_file) in cmd
    assert str(out_file) in cmd


@pytest.mark.asyncio
async def test_call_marp_cli_fallback_when_soffice_missing(tmp_path):
    md_file = tmp_path / "input.md"
    out_file = tmp_path / "output.pptx"
    md_file.write_text("# test", encoding="utf-8")

    captured_cmds = []
    calls = {"count": 0}

    async def _fake_create_subprocess_exec(*cmd, **kwargs):
        captured_cmds.append(list(cmd))
        calls["count"] += 1
        if calls["count"] == 1:
            return _DummyProcess(
                returncode=5,
                stderr=b"LibreOffice soffice binary could not be found.",
            )
        return _DummyProcess(returncode=0)

    with (
        patch(
            "services.generation.marp_generator.check_marp_installed",
            return_value=True,
        ),
        patch(
            "services.generation.marp_generator.asyncio.create_subprocess_exec",
            side_effect=_fake_create_subprocess_exec,
        ),
    ):
        await call_marp_cli(md_file, out_file)

    assert len(captured_cmds) == 2
    assert "--pptx-editable" in captured_cmds[0]
    assert "--pptx-editable" not in captured_cmds[1]
