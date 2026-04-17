from unittest.mock import AsyncMock, patch

import pytest

from services.generation_session_service.tool_refine_builder.quiz import (
    refine_quiz_content,
)


@pytest.mark.anyio
async def test_quiz_refine_prefers_selection_anchor_target() -> None:
    with patch(
        "services.generation_session_service.tool_refine_builder.quiz._load_rag_snippets",
        AsyncMock(return_value=["结合项目资料补充了解析。"]),
    ):
        updated = await refine_quiz_content(
            current_content={
                "kind": "quiz",
                "scope": "牛顿定律",
                "questions": [
                    {
                        "id": "q-1",
                        "question": "旧题 1",
                        "options": ["A", "B"],
                        "answer": "A",
                    },
                    {
                        "id": "q-2",
                        "question": "旧题 2",
                        "options": ["C", "D"],
                        "answer": "C",
                    },
                ],
            },
            message="请把第二题改得更强调边界条件",
            config={
                "current_question_id": "q-1",
                "selection_anchor": {
                    "scope": "question",
                    "anchor_id": "q-2",
                },
            },
            project_id="proj-1",
            rag_source_ids=["file-1"],
        )

    updated_questions = updated["questions"]
    assert updated_questions[1]["id"] == "q-2"
    assert updated_questions[1]["question"] == "请把第二题改得更强调边界条件"
    assert updated_questions[1]["explanation"] == "结合项目资料补充了解析。"
    assert updated["question_count"] == 2
