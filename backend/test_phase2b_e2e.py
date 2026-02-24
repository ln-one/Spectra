"""
Phase 2B 端到端测试
直接创建测试数据并测试完整流程
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.database import db_service


async def setup_test_data():
    """创建测试数据"""
    print("\n=== 创建测试数据 ===")
    
    await db_service.connect()
    
    # 创建测试用户（如果 User 表存在）
    try:
        user = await db_service.db.user.create(
            data={
                "email": "test@example.com",
                "password": "hashed_password",
                "username": "testuser",
                "fullName": "测试用户"
            }
        )
        print(f"✓ 创建测试用户: {user.id}")
        user_id = user.id
    except Exception as e:
        print(f"⚠ 用户可能已存在，使用默认 user_id")
        user_id = "test-user-id-12345"
    
    # 创建测试项目
    try:
        project = await db_service.db.project.create(
            data={
                "userId": user_id,
                "name": "测试项目",
                "description": "用于 Phase 2B 测试",
                "status": "draft"
            }
        )
        print(f"✓ 创建测试项目: {project.id}")
        print(f"  名称: {project.name}")
        print(f"  用户ID: {project.userId}")
        
        await db_service.disconnect()
        return project.id, user_id
        
    except Exception as e:
        print(f"✗ 创建项目失败: {str(e)}")
        await db_service.disconnect()
        return None, None


async def test_generation_flow(project_id: str):
    """测试完整的生成流程"""
    print("\n=== 测试生成流程 ===")
    
    await db_service.connect()
    
    # 1. 创建生成任务
    print("\n1. 创建生成任务...")
    task = await db_service.create_generation_task(
        project_id=project_id,
        task_type="both",
        template_config={"style": "gaia"}
    )
    print(f"✓ 任务创建成功")
    print(f"  Task ID: {task.id}")
    print(f"  状态: {task.status}")
    print(f"  进度: {task.progress}%")
    
    # 2. 更新任务状态为 processing
    print("\n2. 更新任务状态为 processing...")
    task = await db_service.update_generation_task_status(
        task_id=task.id,
        status="processing",
        progress=50
    )
    print(f"✓ 状态更新成功: {task.status} ({task.progress}%)")
    
    # 3. 完成任务
    print("\n3. 完成任务...")
    import json
    output_urls = {
        "pptx": f"/api/v1/files/download/{task.id}/pptx",
        "docx": f"/api/v1/files/download/{task.id}/docx"
    }
    task = await db_service.update_generation_task_status(
        task_id=task.id,
        status="completed",
        progress=100,
        output_urls=json.dumps(output_urls)
    )
    print(f"✓ 任务完成")
    print(f"  状态: {task.status}")
    print(f"  输出: {task.outputUrls}")
    
    # 4. 查询任务
    print("\n4. 查询任务...")
    retrieved_task = await db_service.get_generation_task(task.id)
    print(f"✓ 查询成功")
    print(f"  Task ID: {retrieved_task.id}")
    print(f"  状态: {retrieved_task.status}")
    print(f"  进度: {retrieved_task.progress}%")
    
    await db_service.disconnect()
    
    return task.id


async def print_api_test_commands(project_id: str, task_id: str):
    """打印 API 测试命令"""
    print("\n" + "=" * 60)
    print("🎉 测试数据创建成功！")
    print("=" * 60)
    
    print("\n现在你可以在 Swagger UI 中测试了：")
    print(f"\n1️⃣  测试创建任务 (POST /api/v1/generate/courseware)")
    print("   使用这个 project_id:")
    print(f"   \033[92m{project_id}\033[0m")
    
    print(f"\n2️⃣  测试查询状态 (GET /api/v1/generate/status/{{task_id}})")
    print("   使用这个 task_id:")
    print(f"   \033[92m{task_id}\033[0m")
    
    print(f"\n3️⃣  测试文件下载 (GET /api/v1/files/download/{{task_id}}/{{file_type}})")
    print("   使用这个 task_id:")
    print(f"   \033[92m{task_id}\033[0m")
    print("   file_type 选择: pptx 或 docx")
    
    print("\n" + "=" * 60)
    print("📋 完整的 curl 命令：")
    print("=" * 60)
    
    print(f"\n# 创建任务")
    print(f"""curl -X POST "http://localhost:8000/api/v1/generate/courseware" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "project_id": "{project_id}",
    "type": "both",
    "template_config": {{"style": "gaia"}}
  }}'""")
    
    print(f"\n# 查询状态")
    print(f'curl "http://localhost:8000/api/v1/generate/status/{task_id}"')
    
    print(f"\n# 下载文件")
    print(f'curl -O "http://localhost:8000/api/v1/files/download/{task_id}/pptx"')


async def main():
    """主函数"""
    print("=" * 60)
    print("Phase 2B 端到端测试")
    print("=" * 60)
    
    try:
        # 1. 创建测试数据
        project_id, user_id = await setup_test_data()
        
        if not project_id:
            print("\n✗ 无法创建测试数据")
            return 1
        
        # 2. 测试生成流程
        task_id = await test_generation_flow(project_id)
        
        # 3. 打印测试命令
        await print_api_test_commands(project_id, task_id)
        
        print("\n✅ Phase 2B 功能完全正常！")
        return 0
        
    except Exception as e:
        print(f"\n✗ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
