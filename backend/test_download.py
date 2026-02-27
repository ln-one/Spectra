"""
测试文件下载功能

运行：python test_download.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import httpx


async def test_download():
    """测试下载流程"""
    base_url = "http://localhost:8000/api/v1"

    print("\n=== 测试文件下载功能 ===\n")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. 登录
        print("[1] 登录...")
        resp = await client.post(
            f"{base_url}/auth/login",
            json={"email": "test@example.com", "password": "test123456"},
        )
        if resp.status_code != 200:
            print(f"✗ 登录失败: {resp.status_code}")
            return False

        token = resp.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✓ 登录成功")

        # 2. 创建项目
        print("\n[2] 创建项目...")
        resp = await client.post(
            f"{base_url}/projects",
            json={"name": "测试项目", "subject": "测试", "gradeLevel": "测试"},
            headers=headers,
        )
        if resp.status_code != 200:
            print(f"✗ 创建项目失败: {resp.status_code}")
            return False

        project_id = resp.json()["data"]["project"]["id"]
        print(f"✓ 项目创建成功: {project_id}")

        # 3. 创建生成任务
        print("\n[3] 创建生成任务...")
        resp = await client.post(
            f"{base_url}/generate/courseware",
            json={"project_id": project_id, "type": "both"},
            headers=headers,
        )
        if resp.status_code != 200:
            print(f"✗ 创建任务失败: {resp.status_code}")
            return False

        task_id = resp.json()["data"]["task_id"]
        print(f"✓ 任务创建成功: {task_id}")

        # 4. 等待完成
        print("\n[4] 等待任务完成...")
        for i in range(30):
            await asyncio.sleep(2)
            resp = await client.get(
                f"{base_url}/generate/tasks/{task_id}/status",
                headers=headers,
            )
            if resp.status_code != 200:
                print(f"✗ 查询状态失败: {resp.status_code}")
                return False

            data = resp.json()["data"]
            status = data["status"]
            progress = data.get("progress", 0)
            print(f"  [{i+1}/30] 状态: {status}, 进度: {progress}%")

            if status == "completed":
                print("✓ 任务完成")
                break
            elif status == "failed":
                print(f"✗ 任务失败: {data.get('error')}")
                return False
        else:
            print("✗ 任务超时")
            return False

        # 5. 下载 PPT
        print("\n[5] 下载 PPT...")
        resp = await client.get(
            f"{base_url}/generate/tasks/{task_id}/download",
            params={"file_type": "ppt"},
            headers=headers,
        )
        if resp.status_code != 200:
            print(f"✗ 下载失败: {resp.status_code}")
            print(f"  响应: {resp.text}")
            return False

        output = Path(f"test_{task_id}.pptx")
        output.write_bytes(resp.content)
        print(f"✓ PPT 下载成功: {output} ({len(resp.content)} bytes)")

        # 6. 下载 Word
        print("\n[6] 下载 Word...")
        resp = await client.get(
            f"{base_url}/generate/tasks/{task_id}/download",
            params={"file_type": "word"},
            headers=headers,
        )
        if resp.status_code != 200:
            print(f"✗ 下载失败: {resp.status_code}")
            return False

        output = Path(f"test_{task_id}.docx")
        output.write_bytes(resp.content)
        print(f"✓ Word 下载成功: {output} ({len(resp.content)} bytes)")

        print("\n=== ✓ 所有测试通过 ===\n")
        return True


if __name__ == "__main__":
    print("确保后端服务正在运行: uvicorn main:app --reload")
    success = asyncio.run(test_download())
    sys.exit(0 if success else 1)
