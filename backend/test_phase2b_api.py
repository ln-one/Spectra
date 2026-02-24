"""
Phase 2B API 测试脚本

测试异步任务处理和文件管理功能
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from schemas.generation import GenerateRequest, GenerationType, TemplateConfig
from services.database import db_service
from services.generation import CoursewareContent


async def test_database_operations():
    """测试数据库操作"""
    print("\n=== 测试数据库操作 ===")

    try:
        # 连接数据库
        await db_service.connect()
        print("✓ 数据库连接成功")

        # 测试创建生成任务
        task = await db_service.create_generation_task(
            project_id="test-project-123",
            task_type="both",
            template_config={"style": "default"},
        )
        print(f"✓ 创建生成任务成功: {task.id}")

        # 测试获取任务
        retrieved_task = await db_service.get_generation_task(task.id)
        assert retrieved_task is not None
        print(f"✓ 获取任务成功: {retrieved_task.status}")

        # 测试更新任务状态
        updated_task = await db_service.update_generation_task_status(
            task_id=task.id, status="processing", progress=50
        )
        assert updated_task.status == "processing"
        assert updated_task.progress == 50
        print(f"✓ 更新任务状态成功: {updated_task.status} ({updated_task.progress}%)")

        # 测试完成任务
        import json

        output_urls = {
            "pptx": f"/api/v1/files/download/{task.id}/pptx",
            "docx": f"/api/v1/files/download/{task.id}/docx",
        }
        completed_task = await db_service.update_generation_task_status(
            task_id=task.id,
            status="completed",
            progress=100,
            output_urls=json.dumps(output_urls),
        )
        assert completed_task.status == "completed"
        print(f"✓ 任务完成: {completed_task.outputUrls}")

        return True

    except Exception as e:
        print(f"✗ 数据库操作失败: {str(e)}")
        import traceback

        traceback.print_exc()
        return False
    finally:
        await db_service.disconnect()


async def test_file_utils():
    """测试文件路径工具"""
    print("\n=== 测试文件路径工具 ===")

    try:
        from utils.file_utils import (
            cleanup_file,
            ensure_directory_exists,
            get_generation_output_path,
            get_temp_file_path,
            safe_path_join,
            validate_file_exists,
        )

        # 测试安全路径拼接
        base_dir = Path("generated")
        safe_path = safe_path_join(base_dir, "test-task-123.pptx")
        print(f"✓ 安全路径拼接: {safe_path}")

        # 测试路径遍历防护
        try:
            safe_path_join(base_dir, "../etc/passwd")
            print("✗ 路径遍历防护失败")
            return False
        except ValueError:
            print("✓ 路径遍历防护成功")

        # 测试生成输出路径
        output_path = get_generation_output_path(base_dir, "test-task-123", "pptx")
        print(f"✓ 生成输出路径: {output_path}")

        # 测试临时文件路径
        temp_path = get_temp_file_path(base_dir, "test-task-123", "md")
        print(f"✓ 临时文件路径: {temp_path}")

        # 测试目录创建
        test_dir = Path("test_output")
        ensure_directory_exists(test_dir)
        assert test_dir.exists()
        print(f"✓ 目录创建成功: {test_dir}")

        # 测试文件验证
        test_file = test_dir / "test.txt"
        test_file.write_text("test content")
        assert validate_file_exists(test_file, min_size=1)
        print("✓ 文件验证成功")

        # 测试文件清理
        assert cleanup_file(test_file)
        assert not test_file.exists()
        print(f"✓ 文件清理成功")

        # 清理测试目录
        test_dir.rmdir()

        return True

    except Exception as e:
        print(f"✗ 文件工具测试失败: {str(e)}")
        import traceback

        traceback.print_exc()
        return False


async def test_schemas():
    """测试 Pydantic Schemas"""
    print("\n=== 测试 Pydantic Schemas ===")

    try:
        # 测试 GenerateRequest
        request = GenerateRequest(
            project_id="test-project-123",
            type=GenerationType.BOTH,
            template_config=TemplateConfig(style="gaia"),
        )
        print(f"✓ GenerateRequest 创建成功: {request.type}")

        # 测试空 project_id 验证
        try:
            invalid_request = GenerateRequest(project_id="", type=GenerationType.PPTX)
            print("✗ project_id 验证失败")
            return False
        except ValueError:
            print("✓ project_id 验证成功")

        # 测试 CoursewareContent
        content = CoursewareContent(
            title="测试课件",
            markdown_content="---\nmarp: true\n---\n\n# 标题\n\n内容",
            lesson_plan_markdown="# 教学目标\n\n- 目标1",
        )
        print(f"✓ CoursewareContent 创建成功: {content.title}")

        # 测试标题长度验证
        try:
            invalid_content = CoursewareContent(
                title="a" * 201,  # 超过 200 字符
                markdown_content="test",
                lesson_plan_markdown="test",
            )
            print("✗ 标题长度验证失败 - 应该抛出异常但没有")
            return False
        except Exception as e:  # Pydantic v2 抛出 ValidationError
            print("✓ 标题长度验证成功")

        # 测试危险内容检测
        try:
            dangerous_content = CoursewareContent(
                title="测试",
                markdown_content="<script>alert('xss')</script>",
                lesson_plan_markdown="test",
            )
            print("✗ 危险内容检测失败 - 应该抛出异常但没有")
            return False
        except Exception as e:  # Pydantic v2 抛出 ValidationError
            print("✓ 危险内容检测成功")

        return True

    except Exception as e:
        print(f"✗ Schema 测试失败: {str(e)}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """运行所有测试"""
    print("=" * 60)
    print("Phase 2B API 功能测试")
    print("=" * 60)

    results = []

    # 运行测试
    results.append(("文件路径工具", await test_file_utils()))
    results.append(("Pydantic Schemas", await test_schemas()))
    results.append(("数据库操作", await test_database_operations()))

    # 输出结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    all_passed = True
    for name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{name}: {status}")
        if not passed:
            all_passed = False

    print("=" * 60)
    if all_passed:
        print("✓ 所有测试通过！")
        print("\n下一步：")
        print("1. 启动 FastAPI 服务器: uvicorn main:app --reload")
        print("2. 访问 API 文档: http://localhost:8000/docs")
        print("3. 测试 POST /api/v1/generate/courseware 端点")
        print("4. 测试 GET /api/v1/generate/status/{task_id} 端点")
        print("5. 测试 GET /api/v1/files/download/{task_id}/{file_type} 端点")
    else:
        print("✗ 部分测试失败，请检查错误信息")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
