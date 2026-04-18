from __future__ import annotations

from pathlib import Path

import yaml


def load_ai_tasks(path: Path | None) -> dict:
    if path is None or not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError("ai_tasks.yaml must contain a mapping.")
    return data


def write_ai_brief(path: Path, tasks: dict, markdown_files: list[Path], profile_name: str) -> Path | None:
    if not tasks:
        return None
    lines = [
        "# AI 任务简报",
        "",
        f"- profile: `{profile_name}`",
        f"- source files: `{len(markdown_files)}`",
        "",
        "## 任务定义",
    ]
    for section, payload in tasks.items():
        lines.append(f"### {section}")
        if isinstance(payload, dict):
            for key, value in payload.items():
                lines.append(f"- {key}: {value}")
        else:
            lines.append(f"- {payload}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return path
