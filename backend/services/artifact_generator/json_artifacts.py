import json
import logging
from typing import Any, Dict

from schemas.project_space import ArtifactType

logger = logging.getLogger(__name__)


class ArtifactJsonMixin:
    async def generate_mindmap(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(
            project_id, ArtifactType.MINDMAP.value, artifact_id
        )
        mindmap_data = {
            "title": content.get("title", "思维导图"),
            "nodes": content.get("nodes", []),
            "edges": self._build_edges_from_nodes(content.get("nodes", [])),
            "metadata": {"generated_at": "now", "artifact_id": artifact_id},
        }
        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(mindmap_data, f, ensure_ascii=False, indent=2)
        logger.info("Generated mindmap at %s", storage_path)
        return storage_path

    def _build_edges_from_nodes(self, nodes: list) -> list:
        edges = []
        for node in nodes:
            if node.get("parent_id"):
                edges.append({"from": node["parent_id"], "to": node["id"]})
        return edges

    async def generate_outline(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(
            project_id, ArtifactType.SUMMARY.value, artifact_id
        )
        outline_data = {
            "title": content.get("title", "课程大纲"),
            "sections": content.get("sections", []),
            "metadata": {"generated_at": "now", "artifact_id": artifact_id},
        }
        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(outline_data, f, ensure_ascii=False, indent=2)
        logger.info("Generated outline at %s", storage_path)
        return storage_path

    async def generate_quiz(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(
            project_id, ArtifactType.EXERCISE.value, artifact_id
        )
        quiz_data = {
            "title": content.get("title", "练习题"),
            "questions": content.get("questions", []),
            "metadata": {
                "generated_at": "now",
                "artifact_id": artifact_id,
                "total_questions": len(content.get("questions", [])),
            },
        }
        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(quiz_data, f, ensure_ascii=False, indent=2)
        logger.info("Generated quiz at %s", storage_path)
        return storage_path

    async def generate_summary(
        self, content: Dict[str, Any], project_id: str, artifact_id: str
    ) -> str:
        storage_path = self.get_storage_path(
            project_id, ArtifactType.SUMMARY.value, artifact_id
        )
        summary_data = {
            "title": content.get("title", "课程总结"),
            "summary": content.get("summary", ""),
            "key_points": content.get("key_points", []),
            "slides": content.get("slides", []),
            "turns": content.get("turns", []),
            "question_focus": content.get("question_focus"),
            "student_profiles": content.get("student_profiles", []),
            "metadata": {"generated_at": "now", "artifact_id": artifact_id},
        }
        with open(storage_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, ensure_ascii=False, indent=2)
        logger.info("Generated summary at %s", storage_path)
        return storage_path
