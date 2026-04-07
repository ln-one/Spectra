"""
任务执行器单元测试

测试任务执行逻辑、错误处理和重试机制。
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.task_executor import execute_generation_task


@pytest.fixture
def mock_db_service():
    """Mock 数据库服务"""
    mock = MagicMock()
    mock.connect = AsyncMock()
    mock.disconnect = AsyncMock()
    mock.update_generation_task_status = AsyncMock()
    mock.increment_task_retry_count = AsyncMock()
    mock_task = MagicMock()
    mock_task.sessionId = None
    mock.get_generation_task = AsyncMock(return_value=mock_task)

    # 创建 mock project 对象
    mock_project = MagicMock()
    mock_project.name = "Test Project"
    mock_project.description = "Test Description"
    mock.get_project = AsyncMock(return_value=mock_project)
    mock.get_recent_conversation_messages = AsyncMock(return_value=[])
    mock.get_messages = AsyncMock(return_value=[])
    return mock


@pytest.fixture
def mock_ai_service():
    """Mock AI 服务"""
    mock = AsyncMock()
    mock.generate_courseware_content = AsyncMock(
        return_value={
            "title": "Test Courseware",
            "sections": [{"title": "Section 1", "content": "Content 1"}],
        }
    )
    return mock


@pytest.fixture
def mock_render_engine():
    """Mock render engine adapter outputs."""
    return {
        "build_render_engine_input": MagicMock(return_value={"render_job_id": "job-1"}),
        "invoke_render_engine": AsyncMock(
            return_value={
                "artifacts": {
                    "pptx_path": "/tmp/test.pptx",
                    "docx_path": "/tmp/test.docx",
                }
            }
        ),
        "normalize_render_engine_result": MagicMock(
            return_value={
                "artifact_paths": {
                    "pptx": "/tmp/test.pptx",
                    "docx": "/tmp/test.docx",
                },
                "preview_pages": [],
                "warnings": [],
                "events": [],
                "metrics": {},
            }
        ),
    }


class TestTaskExecutor:
    """任务执行器测试"""

    @pytest.mark.asyncio
    async def test_execute_pptx_task_success(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试成功执行 PPTX 生成任务"""
        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
        ):

            await execute_generation_task(
                task_id="test-task-1",
                project_id="test-project-1",
                task_type="pptx",
            )

            # 验证数据库连接
            mock_db_service.connect.assert_called_once()
            mock_db_service.disconnect.assert_called_once()

            # 验证状态更新
            assert mock_db_service.update_generation_task_status.call_count >= 2

            # 验证最终状态为 completed
            final_call = mock_db_service.update_generation_task_status.call_args_list[
                -1
            ]
            assert final_call[1]["status"] == "completed"
            assert '"pptx"' in final_call[1]["output_urls"]
            assert "/tmp/test.pptx" in final_call[1]["output_urls"]

            # 验证 AI 服务调用
            mock_ai_service.generate_courseware_content.assert_called_once()

            # 验证 render-service 主链调用
            mock_render_engine["build_render_engine_input"].assert_called_once()
            mock_render_engine["invoke_render_engine"].assert_called_once()
            mock_render_engine["normalize_render_engine_result"].assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_both_task_success(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试成功执行 PPTX + DOCX 生成任务"""
        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
        ):

            await execute_generation_task(
                task_id="test-task-2",
                project_id="test-project-2",
                task_type="both",
            )

            # 验证通过 render-service 返回两种格式
            mock_render_engine["build_render_engine_input"].assert_called_once()
            mock_render_engine["invoke_render_engine"].assert_called_once()
            mock_render_engine["normalize_render_engine_result"].assert_called_once()

            # 验证最终状态包含两个 URL
            final_call = mock_db_service.update_generation_task_status.call_args_list[
                -1
            ]
            assert '"pptx"' in final_call[1]["output_urls"]
            assert '"docx"' in final_call[1]["output_urls"]
            assert "/tmp/test.pptx" in final_call[1]["output_urls"]
            assert "/tmp/test.docx" in final_call[1]["output_urls"]

    @pytest.mark.asyncio
    async def test_retryable_error_handling(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试可重试错误处理"""
        # 模拟网络超时错误
        mock_ai_service.generate_courseware_content = AsyncMock(
            side_effect=TimeoutError("Network timeout")
        )

        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
        ):

            # 应该抛出异常以触发重试
            with pytest.raises(TimeoutError):
                await execute_generation_task(
                    task_id="test-task-3",
                    project_id="test-project-3",
                    task_type="pptx",
                )

            # 验证重试计数增加
            mock_db_service.increment_task_retry_count.assert_called_once_with(
                "test-task-3"
            )

    @pytest.mark.asyncio
    async def test_permanent_error_handling(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试不可重试错误处理"""
        # 模拟参数错误
        mock_ai_service.generate_courseware_content = AsyncMock(
            side_effect=ValueError("Invalid parameter")
        )

        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
        ):

            # 不应该抛出异常（不触发重试）
            await execute_generation_task(
                task_id="test-task-4",
                project_id="test-project-4",
                task_type="pptx",
            )

            # 验证任务标记为 failed
            # 找到状态为 failed 的调用
            failed_calls = [
                call
                for call in mock_db_service.update_generation_task_status.call_args_list
                if call[1].get("status") == "failed"
            ]
            assert len(failed_calls) > 0
            assert "ValueError" in failed_calls[0][1]["error_message"]

            # 验证不增加重试计数
            mock_db_service.increment_task_retry_count.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_error_handling_retries_exhausted(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试未知错误处理（重试次数已耗尽）：应标记为 failed"""
        # 模拟未知错误
        mock_ai_service.generate_courseware_content = AsyncMock(
            side_effect=RuntimeError("Unknown error")
        )

        # 模拟当前 RQ job 没有剩余重试次数
        mock_job = MagicMock()
        mock_job.retries_left = 0

        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
            patch("services.task_executor.get_current_job", return_value=mock_job),
        ):

            # 应该抛出异常
            with pytest.raises(RuntimeError):
                await execute_generation_task(
                    task_id="test-task-5",
                    project_id="test-project-5",
                    task_type="pptx",
                )

            # 验证任务标记为 failed
            failed_calls = [
                call
                for call in mock_db_service.update_generation_task_status.call_args_list
                if call[1].get("status") == "failed"
            ]
            assert len(failed_calls) > 0
            assert "RuntimeError" in failed_calls[0][1]["error_message"]

            # 验证不增加重试计数（已耗尽）
            mock_db_service.increment_task_retry_count.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_error_handling_retries_remaining(
        self, mock_db_service, mock_ai_service, mock_render_engine
    ):
        """测试未知错误处理（还有剩余重试次数）：不应标记为 failed，应增加重试计数"""
        # 模拟未知错误
        mock_ai_service.generate_courseware_content = AsyncMock(
            side_effect=RuntimeError("Unknown error")
        )

        # 模拟当前 RQ job 还有剩余重试次数
        mock_job = MagicMock()
        mock_job.retries_left = 2

        with (
            patch("services.database.DatabaseService", return_value=mock_db_service),
            patch("services.ai.ai_service", mock_ai_service),
            patch(
                "services.render_engine_adapter.build_render_engine_input",
                mock_render_engine["build_render_engine_input"],
            ),
            patch(
                "services.render_engine_adapter.invoke_render_engine",
                mock_render_engine["invoke_render_engine"],
            ),
            patch(
                "services.render_engine_adapter.normalize_render_engine_result",
                mock_render_engine["normalize_render_engine_result"],
            ),
            patch("services.task_executor.get_current_job", return_value=mock_job),
        ):

            # 应该抛出异常以触发 RQ 重试
            with pytest.raises(RuntimeError):
                await execute_generation_task(
                    task_id="test-task-6",
                    project_id="test-project-6",
                    task_type="pptx",
                )

            # 验证任务未标记为 failed（避免在重试期间误报）
            failed_calls = [
                call
                for call in mock_db_service.update_generation_task_status.call_args_list
                if call[1].get("status") == "failed"
            ]
            assert len(failed_calls) == 0

            # 验证重试计数已增加
            mock_db_service.increment_task_retry_count.assert_called_once_with(
                "test-task-6"
            )
